import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { Order, OrderItem, Orders } from '../../libs/dto/order/order';
import { AllOrdersInquiry, OrderItemInput, OrdersInquiry } from '../../libs/dto/order/order.input';
import { OrderUpdate } from '../../libs/dto/order/order.update';
import { Product } from '../../libs/dto/product/product';
import { OrderStatus } from '../../libs/enums/order.enum';
import { ProductStatus } from '../../libs/enums/product.enum';
import { Direction, Message } from '../../libs/enums/common.enum';
import { T } from '../../libs/types/common';
import { MemberService } from '../member/member.service';
import { ProductService } from '../product/product.service';
import { lookupOrderItems, lookupOrderProducts, shapeIntoMongoObjectId } from '../../libs/config';

/** flat rate for now — a delivery-rules engine is a later concern */
const DELIVERY_FEE = 3000;

@Injectable()
export class OrderService {
	constructor(
		@InjectModel('Order') private readonly orderModel: Model<Order>,
		@InjectModel('OrderItem') private readonly orderItemModel: Model<OrderItem>,
		// read-only price/stock lookups; every write to products goes through ProductService
		@InjectModel('Product') private readonly productModel: Model<Product>,
		private readonly memberService: MemberService,
		private readonly productService: ProductService,
	) {}

	/** the cart — one open PAUSE order per member, created on first use */
	public async getMyCart(memberId: ObjectId): Promise<Order> {
		let cart = await this.orderModel.findOne({ memberId, orderStatus: OrderStatus.PAUSE }).exec();
		if (!cart) cart = await this.orderModel.create({ memberId, orderStatus: OrderStatus.PAUSE });
		return await this.readOrder(cart._id);
	}

	public async addToCart(memberId: ObjectId, input: OrderItemInput): Promise<Order> {
		const cart = await this.openCart(memberId);
		const product = await this.readSellableProduct(input.productId);

		if (product.productStock < input.itemQuantity) throw new BadRequestException(Message.NOT_ENOUGH_STOCK);

		const existing = await this.orderItemModel
			.findOne({ orderId: cart._id, productId: product._id })
			.exec();

		if (existing) {
			const quantity = existing.itemQuantity + input.itemQuantity;
			if (product.productStock < quantity) throw new BadRequestException(Message.NOT_ENOUGH_STOCK);
			existing.itemQuantity = quantity;
			// re-snapshot the price so an unsubmitted cart reflects the current one
			existing.itemPrice = product.productPrice;
			existing.itemDiscount = product.productDiscount;
			await existing.save();
		} else {
			await this.orderItemModel.create({
				orderId: cart._id,
				productId: product._id,
				sellerId: product.memberId,
				itemQuantity: input.itemQuantity,
				itemPrice: product.productPrice,
				itemDiscount: product.productDiscount,
			});
		}

		await this.recalculateTotals(cart._id);
		return await this.readOrder(cart._id);
	}

	public async removeFromCart(memberId: ObjectId, productId: ObjectId): Promise<Order> {
		const cart = await this.openCart(memberId);

		const removed = await this.orderItemModel.findOneAndDelete({ orderId: cart._id, productId }).exec();
		if (!removed) throw new NotFoundException(Message.NO_DATA_FOUND);

		await this.recalculateTotals(cart._id);
		return await this.readOrder(cart._id);
	}

	/**
	 * Checkout. Totals are recomputed from the live products — a client-supplied
	 * price never reaches the database — and stock is taken with a conditional
	 * decrement so two concurrent checkouts cannot oversell.
	 */
	public async createOrder(memberId: ObjectId, input: OrderItemInput[]): Promise<Order> {
		if (!input?.length) throw new BadRequestException(Message.EMPTY_CART);

		const cart = await this.openCart(memberId);
		await this.orderItemModel.deleteMany({ orderId: cart._id }).exec();

		for (const item of input) {
			const productId = shapeIntoMongoObjectId(item.productId);
			const product = await this.readSellableProduct(productId);

			await this.orderItemModel.create({
				orderId: cart._id,
				productId: product._id,
				sellerId: product.memberId,
				itemQuantity: item.itemQuantity,
				itemPrice: product.productPrice,
				itemDiscount: product.productDiscount,
			});
		}

		await this.recalculateTotals(cart._id);

		// take the stock only once every line has been priced
		const lines = await this.orderItemModel.find({ orderId: cart._id }).exec();
		const taken: OrderItem[] = [];
		try {
			for (const line of lines) {
				await this.productService.decrementStock(line.productId, line.itemQuantity);
				taken.push(line);
			}
		} catch (err) {
			// give back whatever was already taken, so a partial failure leaves no hole
			for (const line of taken) {
				await this.productService.restoreStock(line.productId, line.itemQuantity);
			}
			throw err;
		}

		const result = await this.orderModel
			.findByIdAndUpdate(cart._id, { orderStatus: OrderStatus.PROCESS }, { new: true })
			.exec();
		if (!result) throw new BadRequestException(Message.CREATE_FAILED);

		await this.memberService.memberStatsEditor({ _id: memberId, targetKey: 'memberOrders', modifier: 1 });
		await this.memberService.memberStatsEditor({
			_id: memberId,
			targetKey: 'memberPoints',
			modifier: Math.floor(result.orderTotal / 1000),
		});
		for (const line of lines) {
			await this.memberService.memberStatsEditor({
				_id: line.sellerId,
				targetKey: 'memberSales',
				modifier: line.itemQuantity,
			});
		}

		return await this.readOrder(result._id);
	}

	public async updateOrder(memberId: ObjectId, input: OrderUpdate): Promise<Order> {
		const { _id, orderStatus } = input;
		const target = await this.orderModel.findOne({ _id, memberId }).exec();
		if (!target) throw new NotFoundException(Message.NO_DATA_FOUND);

		if (orderStatus === OrderStatus.CANCEL) {
			// only an order that has not shipped out of PROCESS may still be pulled back
			if (target.orderStatus !== OrderStatus.PROCESS)
				throw new BadRequestException(Message.ORDER_NOT_CANCELLABLE);
			await this.restoreOrderStock(target._id);
		} else if (orderStatus === OrderStatus.PROCESS) {
			// checkout is createOrder's job; this endpoint may not mint an order
			throw new ForbiddenException(Message.NOT_ALLOWED_REQUEST);
		}

		const result = await this.orderModel
			.findByIdAndUpdate(target._id, { orderStatus }, { new: true })
			.exec();
		if (!result) throw new BadRequestException(Message.UPDATE_FAILED);
		return await this.readOrder(result._id);
	}

	public async getMyOrders(memberId: ObjectId, input: OrdersInquiry): Promise<Orders> {
		const match: T = { memberId: memberId };
		const sort: T = { [input?.sort ?? 'updatedAt']: input?.direction ?? Direction.DESC };

		if (input.search?.orderStatus) match.orderStatus = input.search.orderStatus;
		else match.orderStatus = { $ne: OrderStatus.PAUSE }; // the cart is not order history

		return await this.aggregateOrders(match, sort, input.page, input.limit);
	}

	/** orders containing this seller's products */
	public async getSellerOrders(sellerId: ObjectId, input: OrdersInquiry): Promise<Orders> {
		const lines = await this.orderItemModel.find({ sellerId }).select('orderId').lean().exec();
		const orderIds = lines.map((ele) => ele.orderId);

		const match: T = { _id: { $in: orderIds }, orderStatus: { $ne: OrderStatus.PAUSE } };
		const sort: T = { [input?.sort ?? 'updatedAt']: input?.direction ?? Direction.DESC };

		if (input.search?.orderStatus) match.orderStatus = input.search.orderStatus;

		return await this.aggregateOrders(match, sort, input.page, input.limit);
	}

	/** ADMIN **/

	public async getAllOrdersByAdmin(input: AllOrdersInquiry): Promise<Orders> {
		const match: T = {};
		const sort: T = { [input?.sort ?? 'updatedAt']: input?.direction ?? Direction.DESC };

		if (input.search?.orderStatus) match.orderStatus = input.search.orderStatus;
		if (input.search?.memberId) match.memberId = shapeIntoMongoObjectId(input.search.memberId);

		return await this.aggregateOrders(match, sort, input.page, input.limit);
	}

	public async updateOrderByAdmin(input: OrderUpdate): Promise<Order> {
		const target = await this.orderModel.findById(input._id).exec();
		if (!target) throw new NotFoundException(Message.NO_DATA_FOUND);

		if (input.orderStatus === OrderStatus.CANCEL && target.orderStatus === OrderStatus.PROCESS) {
			await this.restoreOrderStock(target._id);
		}

		const result = await this.orderModel
			.findByIdAndUpdate(target._id, { orderStatus: input.orderStatus }, { new: true })
			.exec();
		if (!result) throw new BadRequestException(Message.UPDATE_FAILED);
		return await this.readOrder(result._id);
	}

	/* ---------------------------------------------------------------- */
	/* internals                                                        */
	/* ---------------------------------------------------------------- */

	private async openCart(memberId: ObjectId): Promise<Order> {
		const cart = await this.orderModel.findOne({ memberId, orderStatus: OrderStatus.PAUSE }).exec();
		if (cart) return cart;
		return await this.orderModel.create({ memberId, orderStatus: OrderStatus.PAUSE });
	}

	private async readSellableProduct(productId: ObjectId): Promise<Product> {
		const product = await this.productModel
			.findOne({ _id: productId, productStatus: ProductStatus.ACTIVE })
			.lean<Product>()
			.exec();
		if (!product) throw new NotFoundException(Message.NO_DATA_FOUND);
		if (product.productStock <= 0) throw new BadRequestException(Message.OUT_OF_STOCK);
		return product;
	}

	/** always derived from the stored line snapshots, never from the client */
	private async recalculateTotals(orderId: ObjectId): Promise<void> {
		const lines = await this.orderItemModel.find({ orderId }).lean().exec();

		const subTotal = lines.reduce((sum, line) => {
			const unit = line.itemPrice * (1 - (line.itemDiscount ?? 0) / 100);
			return sum + unit * line.itemQuantity;
		}, 0);
		const delivery = lines.length ? DELIVERY_FEE : 0;

		await this.orderModel
			.findByIdAndUpdate(orderId, {
				orderSubTotal: Math.round(subTotal),
				orderDelivery: delivery,
				orderTotal: Math.round(subTotal) + delivery,
			})
			.exec();
	}

	private async restoreOrderStock(orderId: ObjectId): Promise<void> {
		const lines = await this.orderItemModel.find({ orderId }).exec();
		for (const line of lines) {
			await this.productService.restoreStock(line.productId, line.itemQuantity);
		}
	}

	private async readOrder(orderId: ObjectId): Promise<Order> {
		const result = await this.orderModel
			.aggregate([
				{ $match: { _id: orderId } },
				lookupOrderItems,
				lookupOrderProducts,
			])
			.exec();
		if (!result.length) throw new NotFoundException(Message.NO_DATA_FOUND);
		return result[0];
	}

	private async aggregateOrders(match: T, sort: T, page: number, limit: number): Promise<Orders> {
		const result = await this.orderModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							lookupOrderItems,
							lookupOrderProducts,
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] ?? { list: [], metaCounter: [] };
	}
}
