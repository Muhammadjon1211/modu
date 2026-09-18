import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, PipelineStage } from 'mongoose';
import moment from 'moment';
import { Order, OrderItem, Orders, StoreCustomers, StoreSummary } from '../../libs/dto/order/order';
import {
	AllOrdersInquiry,
	CartItemUpdate,
	OrderInput,
	OrderItemInput,
	OrdersInquiry,
	StoreCustomersInquiry,
} from '../../libs/dto/order/order.input';
import { OrderShipping } from '../../libs/dto/address/address';
import { OrderUpdate } from '../../libs/dto/order/order.update';
import { Product } from '../../libs/dto/product/product';
import { OrderStatus } from '../../libs/enums/order.enum';
import { ProductColor, ProductSize, ProductStatus } from '../../libs/enums/product.enum';
import { Direction, Message } from '../../libs/enums/common.enum';
import { T } from '../../libs/types/common';
import { MemberService } from '../member/member.service';
import { ProductService } from '../product/product.service';
import { AddressService } from '../address/address.service';
import { PaymentService, PaymentSnapshot } from '../payment/payment.service';
import { lookupMember, lookupOrderItems, lookupOrderProducts, shapeIntoMongoObjectId } from '../../libs/config';

/** flat rate for now — a delivery-rules engine is a later concern */
const DELIVERY_FEE = 3000;

@Injectable()
export class OrderService implements OnModuleInit {
	constructor(
		@InjectModel('Order') private readonly orderModel: Model<Order>,
		@InjectModel('OrderItem') private readonly orderItemModel: Model<OrderItem>,
		// read-only price/stock lookups; every write to products goes through ProductService
		@InjectModel('Product') private readonly productModel: Model<Product>,
		private readonly memberService: MemberService,
		private readonly productService: ProductService,
		private readonly addressService: AddressService,
		private readonly paymentService: PaymentService,
	) {}

	/**
	 * The line index used to be unique on (order, product); a product can now sit in the cart
	 * in several sizes. syncIndexes drops the old unique index so the new one can take over.
	 */
	public async onModuleInit(): Promise<void> {
		await this.orderItemModel.syncIndexes();
	}

	/** the cart — one open PAUSE order per member, created on first use */
	public async getMyCart(memberId: ObjectId): Promise<Order> {
		let cart = await this.orderModel.findOne({ memberId, orderStatus: OrderStatus.PAUSE }).exec();
		if (!cart) cart = await this.orderModel.create({ memberId, orderStatus: OrderStatus.PAUSE });
		return await this.readOrder(cart._id);
	}

	public async addToCart(memberId: ObjectId, input: OrderItemInput): Promise<Order> {
		const cart = await this.openCart(memberId);
		const product = await this.readSellableProduct(input.productId);
		const variant = this.resolveVariant(product, input.itemSize, input.itemColor);

		// stock is per product, so every size of it in the cart counts against it
		const inCart = await this.cartQuantityOf(cart._id, product._id);
		if (product.productStock < inCart + input.itemQuantity) throw new BadRequestException(Message.NOT_ENOUGH_STOCK);

		const existing = await this.orderItemModel
			.findOne({ orderId: cart._id, productId: product._id, ...variant })
			.exec();

		if (existing) {
			existing.itemQuantity += input.itemQuantity;
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
				...variant,
			});
		}

		await this.recalculateTotals(cart._id);
		return await this.readOrder(cart._id);
	}

	/** sets a line's quantity outright — the cart page's stepper */
	public async updateCartItem(memberId: ObjectId, input: CartItemUpdate): Promise<Order> {
		const cart = await this.openCart(memberId);
		const line = await this.orderItemModel.findOne({ _id: input.orderItemId, orderId: cart._id }).exec();
		if (!line) throw new NotFoundException(Message.NO_DATA_FOUND);

		const product = await this.readSellableProduct(line.productId);
		const others = (await this.cartQuantityOf(cart._id, product._id)) - line.itemQuantity;
		if (product.productStock < others + input.itemQuantity) throw new BadRequestException(Message.NOT_ENOUGH_STOCK);

		line.itemQuantity = input.itemQuantity;
		line.itemPrice = product.productPrice;
		line.itemDiscount = product.productDiscount;
		await line.save();

		await this.recalculateTotals(cart._id);
		return await this.readOrder(cart._id);
	}

	public async removeFromCart(memberId: ObjectId, orderItemId: ObjectId): Promise<Order> {
		const cart = await this.openCart(memberId);

		const removed = await this.orderItemModel.findOneAndDelete({ _id: orderItemId, orderId: cart._id }).exec();
		if (!removed) throw new NotFoundException(Message.NO_DATA_FOUND);

		await this.recalculateTotals(cart._id);
		return await this.readOrder(cart._id);
	}

	/**
	 * Checkout. The lines are the server-side cart; every one is re-validated and re-priced
	 * from the live product, so neither prices nor variants are ever trusted from the client.
	 * Stock is taken with a conditional decrement, so two concurrent checkouts cannot oversell.
	 * Shipping and payment are resolved first — nothing is taken until both are valid.
	 */
	public async createOrder(memberId: ObjectId, input: OrderInput): Promise<Order> {
		const cart = await this.openCart(memberId);
		const lines = await this.orderItemModel.find({ orderId: cart._id }).exec();
		if (!lines.length) throw new BadRequestException(Message.EMPTY_CART);

		const shipping = await this.resolveShipping(memberId, input);
		const payment = await this.resolvePayment(memberId, input);

		for (const line of lines) {
			const product = await this.readSellableProduct(line.productId);
			this.resolveVariant(product, line.itemSize as ProductSize, line.itemColor as ProductColor);
			line.itemPrice = product.productPrice;
			line.itemDiscount = product.productDiscount;
			await line.save();
		}
		await this.recalculateTotals(cart._id);

		// take the stock only once every line has been priced
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
			.findByIdAndUpdate(
				cart._id,
				{
					orderStatus: OrderStatus.PROCESS,
					// purchasedAt anchors the return window; createdAt is when the cart opened
					purchasedAt: moment().toDate(),
					orderShipping: shipping,
					orderPayment: {
						paymentType: payment.paymentType,
						holderName: payment.holderName,
						provider: payment.provider,
						last4: payment.last4,
					},
				},
				{ new: true },
			)
			.exec();
		if (!result) throw new BadRequestException(Message.CREATE_FAILED);

		// saved only after the order went through, so a failed checkout leaves nothing behind
		if (!input.addressId && input.saveAddress && input.shipping) {
			await this.addressService.createAddress({ ...input.shipping, memberId });
		}
		if (!input.paymentMethodId && input.savePayment && input.payment) {
			await this.paymentService.createPaymentMethod(memberId, input.payment);
		}

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
		const target = await this.orderModel.findOne({ _id: input._id, memberId }).exec();
		if (!target) throw new NotFoundException(Message.NO_DATA_FOUND);
		return await this.applyTransition(target, input.orderStatus);
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
		if (input.search?.sellerId) {
			const sellerId = shapeIntoMongoObjectId(input.search.sellerId);
			const lines = await this.orderItemModel.find({ sellerId }).select('orderId').lean().exec();
			match._id = { $in: lines.map((ele) => ele.orderId) };
			// a store's sales list is not interested in carts that merely hold its items
			if (!input.search.orderStatus) match.orderStatus = { $ne: OrderStatus.PAUSE };
		}

		return await this.aggregateOrders(match, sort, input.page, input.limit, true);
	}

	/** who bought from this store, and how much — ranked by spend */
	public async getStoreCustomersByAdmin(input: StoreCustomersInquiry): Promise<StoreCustomers> {
		const { page, limit } = input;
		const sellerId = shapeIntoMongoObjectId(input.search.sellerId);

		const result = await this.orderItemModel
			.aggregate([
				...this.paidStoreLines(sellerId),
				{
					$group: {
						_id: '$order.memberId',
						orders: { $addToSet: '$orderId' },
						unitsBought: { $sum: '$itemQuantity' },
						totalSpent: { $sum: '$lineTotal' },
						lastOrderAt: { $max: '$order.purchasedAt' },
					},
				},
				{
					$project: {
						orderCount: { $size: '$orders' },
						unitsBought: 1,
						totalSpent: { $round: ['$totalSpent', 0] },
						lastOrderAt: 1,
					},
				},
				{ $sort: { totalSpent: Direction.DESC, _id: Direction.ASC } },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							{ $lookup: { from: 'members', localField: '_id', foreignField: '_id', as: 'memberData' } },
							{ $unwind: { path: '$memberData', preserveNullAndEmptyArrays: true } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] ?? { list: [], metaCounter: [] };
	}

	public async getStoreSummaryByAdmin(input: ObjectId): Promise<StoreSummary> {
		const sellerId = shapeIntoMongoObjectId(input);
		const result = await this.orderItemModel
			.aggregate([
				...this.paidStoreLines(sellerId),
				{
					$group: {
						_id: null,
						orders: { $addToSet: '$orderId' },
						customers: { $addToSet: '$order.memberId' },
						unitsSold: { $sum: '$itemQuantity' },
						grossSales: { $sum: '$lineTotal' },
					},
				},
				{
					$project: {
						_id: 0,
						orderCount: { $size: '$orders' },
						customerCount: { $size: '$customers' },
						unitsSold: 1,
						grossSales: { $round: ['$grossSales', 0] },
					},
				},
			])
			.exec();

		return result[0] ?? { orderCount: 0, unitsSold: 0, grossSales: 0, customerCount: 0 };
	}

	public async updateOrderByAdmin(input: OrderUpdate): Promise<Order> {
		const target = await this.orderModel.findById(input._id).exec();
		if (!target) throw new NotFoundException(Message.NO_DATA_FOUND);
		return await this.applyTransition(target, input.orderStatus);
	}

	/* ---------------------------------------------------------------- */
	/* internals                                                        */
	/* ---------------------------------------------------------------- */

	/**
	 * The order state machine, shared by buyer and admin.
	 * PAUSE only leaves through createOrder (which takes the stock); FINISH and CANCEL are terminal.
	 * Without this, a cart or a cancelled order could be pushed to FINISH/PROCESS without
	 * stock ever being taken — and then count as a purchase for reviews and refunds.
	 */
	private assertTransition(from: OrderStatus, to: OrderStatus): void {
		const allowed: Record<OrderStatus, OrderStatus[]> = {
			[OrderStatus.PAUSE]: [],
			[OrderStatus.PROCESS]: [OrderStatus.FINISH, OrderStatus.CANCEL],
			[OrderStatus.FINISH]: [],
			[OrderStatus.CANCEL]: [],
		};
		if (allowed[from].includes(to)) return;
		if (to === OrderStatus.CANCEL) throw new BadRequestException(Message.ORDER_NOT_CANCELLABLE);
		throw new BadRequestException(Message.ORDER_NOT_UPDATABLE);
	}

	private async applyTransition(target: Order, orderStatus: OrderStatus): Promise<Order> {
		this.assertTransition(target.orderStatus, orderStatus);

		// conditional on the current status, so two concurrent cancels cannot both restock
		const result = await this.orderModel
			.findOneAndUpdate({ _id: target._id, orderStatus: target.orderStatus }, { orderStatus }, { new: true })
			.exec();
		if (!result) throw new BadRequestException(Message.UPDATE_FAILED);

		if (orderStatus === OrderStatus.CANCEL) await this.restoreOrderStock(target._id);
		return await this.readOrder(result._id);
	}

	private async openCart(memberId: ObjectId): Promise<Order> {
		const cart = await this.orderModel.findOne({ memberId, orderStatus: OrderStatus.PAUSE }).exec();
		if (cart) return cart;
		return await this.orderModel.create({ memberId, orderStatus: OrderStatus.PAUSE });
	}

	/**
	 * A size / color must be one the product offers. A product with a single option
	 * gets it filled in; one with several makes the buyer choose.
	 */
	private resolveVariant(
		product: Product,
		size?: ProductSize,
		color?: ProductColor,
	): { itemSize?: ProductSize; itemColor?: ProductColor } {
		const sizes = product.productSizes ?? [];
		const colors = product.productColors ?? [];

		const itemSize = size ?? (sizes.length === 1 ? sizes[0] : undefined);
		const itemColor = color ?? (colors.length === 1 ? colors[0] : undefined);

		if (sizes.length && !itemSize) throw new BadRequestException(Message.SIZE_REQUIRED);
		if (colors.length && !itemColor) throw new BadRequestException(Message.COLOR_REQUIRED);
		if (itemSize && !sizes.includes(itemSize)) throw new BadRequestException(Message.OPTION_NOT_AVAILABLE);
		if (itemColor && !colors.includes(itemColor)) throw new BadRequestException(Message.OPTION_NOT_AVAILABLE);

		return { itemSize, itemColor };
	}

	private async cartQuantityOf(orderId: ObjectId, productId: ObjectId): Promise<number> {
		const lines = await this.orderItemModel.find({ orderId, productId }).select('itemQuantity').lean().exec();
		return lines.reduce((sum, ele) => sum + ele.itemQuantity, 0);
	}

	private async resolveShipping(memberId: ObjectId, input: OrderInput): Promise<OrderShipping> {
		const source = input.addressId
			? await this.addressService.readOwned(memberId, shapeIntoMongoObjectId(input.addressId))
			: input.shipping;
		if (!source) throw new BadRequestException(Message.ADDRESS_REQUIRED);

		const { recipientName, recipientPhone, addressLine1, addressLine2, city, postalCode } = source;
		return { recipientName, recipientPhone, addressLine1, addressLine2, city, postalCode };
	}

	private async resolvePayment(memberId: ObjectId, input: OrderInput): Promise<PaymentSnapshot> {
		if (input.paymentMethodId) {
			return await this.paymentService.readOwned(memberId, shapeIntoMongoObjectId(input.paymentMethodId));
		}
		if (!input.payment) throw new BadRequestException(Message.PAYMENT_REQUIRED);
		return this.paymentService.toSnapshot(input.payment);
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

	/**
	 * A store's lines in orders that were actually paid (PROCESS or FINISH), each with its
	 * discounted line total — the same unit-price rule recalculateTotals uses.
	 */
	private paidStoreLines(sellerId: ObjectId): PipelineStage[] {
		return [
			{ $match: { sellerId } },
			{ $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'order' } },
			{ $unwind: '$order' },
			{ $match: { 'order.orderStatus': { $in: [OrderStatus.PROCESS, OrderStatus.FINISH] } } },
			{
				$addFields: {
					lineTotal: {
						$multiply: [
							'$itemQuantity',
							'$itemPrice',
							{ $subtract: [1, { $divide: [{ $ifNull: ['$itemDiscount', 0] }, 100] }] },
						],
					},
				},
			},
		];
	}

	/** withBuyer joins the buyer's member document — admin lists only, never the seller's view */
	private async aggregateOrders(
		match: T,
		sort: T,
		page: number,
		limit: number,
		withBuyer: boolean = false,
	): Promise<Orders> {
		const buyerLookup = withBuyer
			? [lookupMember, { $unwind: { path: '$memberData', preserveNullAndEmptyArrays: true } }]
			: [];

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
							...buyerLookup,
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] ?? { list: [], metaCounter: [] };
	}
}
