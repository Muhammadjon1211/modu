import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import moment from 'moment';
import { Return, ReturnEligibility, Returns } from '../../libs/dto/return/return';
import { AllReturnsInquiry, ReturnInput, ReturnsInquiry } from '../../libs/dto/return/return.input';
import { ReturnUpdate } from '../../libs/dto/return/return.update';
import { Order, OrderItem } from '../../libs/dto/order/order';
import { ReturnStatus } from '../../libs/enums/return.enum';
import { OrderStatus } from '../../libs/enums/order.enum';
import { Direction, Message } from '../../libs/enums/common.enum';
import { T } from '../../libs/types/common';
import { MemberService } from '../member/member.service';
import { ProductService } from '../product/product.service';
import { RETURN_WINDOW_DAYS, lookupMember, lookupReturnProduct } from '../../libs/config';

/** statuses that still hold a claim on the purchased quantity */
const CLAIMING_STATUSES = [ReturnStatus.REQUEST, ReturnStatus.APPROVE, ReturnStatus.COMPLETE];

@Injectable()
export class ReturnService {
	constructor(
		@InjectModel('Return') private readonly returnModel: Model<Return>,
		// read-only: returns are validated against the order, but never write to it
		@InjectModel('Order') private readonly orderModel: Model<Order>,
		@InjectModel('OrderItem') private readonly orderItemModel: Model<OrderItem>,
		private readonly memberService: MemberService,
		private readonly productService: ProductService,
	) {}

	public async requestReturn(memberId: ObjectId, input: ReturnInput): Promise<Return> {
		const { line, order } = await this.readOwnedLine(memberId, input.orderItemId);

		this.assertWithinWindow(order);

		const returnable = line.itemQuantity - (await this.claimedQuantity(line._id));
		if (input.returnQuantity > returnable) throw new BadRequestException(Message.RETURN_QUANTITY_EXCEEDED);

		// the refund comes from the line's price snapshot, never from the client
		input.memberId = memberId;
		input.sellerId = line.sellerId;
		input.orderId = line.orderId;
		input.productId = line.productId;
		input.returnAmount = this.refundFor(line, input.returnQuantity);

		try {
			return await this.returnModel.create(input);
		} catch (err) {
			console.log('Error, Service.model:', err.message);
			throw new BadRequestException(Message.CREATE_FAILED);
		}
	}

	/** drives the "Return this item" button — no throwing, it answers a question */
	public async checkReturnEligibility(memberId: ObjectId, orderItemId: ObjectId): Promise<ReturnEligibility> {
		const line = await this.orderItemModel.findById(orderItemId).lean<OrderItem>().exec();
		if (!line) return { eligible: false, quantityReturnable: 0, reason: Message.NO_DATA_FOUND };

		const order = await this.orderModel.findById(line.orderId).lean<Order>().exec();
		if (!order || String(order.memberId) !== String(memberId))
			return { eligible: false, quantityReturnable: 0, reason: Message.NOT_ALLOWED_REQUEST };

		if (![OrderStatus.PROCESS, OrderStatus.FINISH].includes(order.orderStatus))
			return { eligible: false, quantityReturnable: 0, reason: Message.RETURN_NOT_ELIGIBLE };

		const closesAt = this.windowCloseDate(order);
		const returnable = line.itemQuantity - (await this.claimedQuantity(line._id));

		if (moment().isAfter(closesAt))
			return {
				eligible: false,
				quantityReturnable: 0,
				windowClosesAt: closesAt,
				reason: Message.RETURN_WINDOW_EXPIRED,
			};

		if (returnable <= 0)
			return {
				eligible: false,
				quantityReturnable: 0,
				windowClosesAt: closesAt,
				reason: Message.RETURN_QUANTITY_EXCEEDED,
			};

		return { eligible: true, quantityReturnable: returnable, windowClosesAt: closesAt };
	}

	/** the buyer withdraws, only while the seller has not acted yet */
	public async cancelReturn(memberId: ObjectId, returnId: ObjectId): Promise<Return> {
		const target = await this.returnModel.findOne({ _id: returnId, memberId }).exec();
		if (!target) throw new NotFoundException(Message.NO_DATA_FOUND);
		if (target.returnStatus !== ReturnStatus.REQUEST)
			throw new BadRequestException(Message.RETURN_NOT_CANCELLABLE);

		const result = await this.returnModel
			.findByIdAndUpdate(
				returnId,
				{ returnStatus: ReturnStatus.CANCEL, cancelledAt: moment().toDate() },
				{ new: true },
			)
			.exec();
		if (!result) throw new BadRequestException(Message.UPDATE_FAILED);
		return result;
	}

	/**
	 * The seller moves the return along. Reaching COMPLETE is what actually
	 * puts the goods back into stock and reverses the sale.
	 */
	public async updateReturn(sellerId: ObjectId, input: ReturnUpdate): Promise<Return> {
		// the sellerId in the filter is the ownership check
		const target = await this.returnModel.findOne({ _id: input._id, sellerId }).exec();
		if (!target) throw new NotFoundException(Message.NO_DATA_FOUND);

		// a seller may not cancel on the buyer's behalf
		if (input.returnStatus === ReturnStatus.CANCEL) throw new ForbiddenException(Message.NOT_ALLOWED_REQUEST);

		return await this.applyTransition(target, input);
	}

	public async getMyReturns(memberId: ObjectId, input: ReturnsInquiry): Promise<Returns> {
		const match: T = { memberId: memberId };
		if (input.search?.returnStatus) match.returnStatus = input.search.returnStatus;
		return await this.aggregateReturns(match, this.sortOf(input), input.page, input.limit);
	}

	public async getSellerReturns(sellerId: ObjectId, input: ReturnsInquiry): Promise<Returns> {
		const match: T = { sellerId: sellerId };
		if (input.search?.returnStatus) match.returnStatus = input.search.returnStatus;
		return await this.aggregateReturns(match, this.sortOf(input), input.page, input.limit);
	}

	/** ADMIN **/

	public async getAllReturnsByAdmin(input: AllReturnsInquiry): Promise<Returns> {
		const { returnStatus, returnReason, memberId, sellerId } = input.search;
		const match: T = {};

		if (returnStatus) match.returnStatus = returnStatus;
		if (returnReason) match.returnReason = returnReason;
		if (memberId) match.memberId = memberId;
		if (sellerId) match.sellerId = sellerId;

		return await this.aggregateReturns(match, this.sortOf(input), input.page, input.limit);
	}

	/** the admin can force any transition, including one a seller is refusing to make */
	public async updateReturnByAdmin(input: ReturnUpdate): Promise<Return> {
		const target = await this.returnModel.findById(input._id).exec();
		if (!target) throw new NotFoundException(Message.NO_DATA_FOUND);
		return await this.applyTransition(target, input);
	}

	/* ---------------------------------------------------------------- */
	/* internals                                                        */
	/* ---------------------------------------------------------------- */

	/**
	 * The state machine, in one readable place.
	 * REJECT, COMPLETE and CANCEL are terminal.
	 */
	private assertTransition(from: ReturnStatus, to: ReturnStatus): void {
		const allowed: Record<ReturnStatus, ReturnStatus[]> = {
			[ReturnStatus.REQUEST]: [ReturnStatus.APPROVE, ReturnStatus.REJECT, ReturnStatus.CANCEL],
			[ReturnStatus.APPROVE]: [ReturnStatus.COMPLETE, ReturnStatus.REJECT],
			[ReturnStatus.REJECT]: [],
			[ReturnStatus.COMPLETE]: [],
			[ReturnStatus.CANCEL]: [],
		};
		if (!allowed[from].includes(to)) throw new BadRequestException(Message.RETURN_NOT_UPDATABLE);
	}

	private async applyTransition(target: Return, input: ReturnUpdate): Promise<Return> {
		this.assertTransition(target.returnStatus, input.returnStatus);

		const now = moment().toDate();
		if (input.returnStatus === ReturnStatus.APPROVE) input.approvedAt = now;
		else if (input.returnStatus === ReturnStatus.REJECT) input.rejectedAt = now;
		else if (input.returnStatus === ReturnStatus.CANCEL) input.cancelledAt = now;
		else if (input.returnStatus === ReturnStatus.COMPLETE) {
			input.completedAt = now;
			// the goods are physically back: restock, and reverse the sale counters
			await this.productService.restoreStock(target.productId, target.returnQuantity);
			await this.memberService.memberStatsEditor({
				_id: target.sellerId,
				targetKey: 'memberSales',
				modifier: -target.returnQuantity,
			});
			await this.memberService.memberStatsEditor({
				_id: target.memberId,
				targetKey: 'memberPoints',
				modifier: -Math.floor(target.returnAmount / 1000),
			});
		}

		const result = await this.returnModel.findByIdAndUpdate(target._id, input, { new: true }).exec();
		if (!result) throw new BadRequestException(Message.UPDATE_FAILED);
		return result;
	}

	private async readOwnedLine(
		memberId: ObjectId,
		orderItemId: ObjectId,
	): Promise<{ line: OrderItem; order: Order }> {
		const line = await this.orderItemModel.findById(orderItemId).lean<OrderItem>().exec();
		if (!line) throw new NotFoundException(Message.NO_DATA_FOUND);

		const order = await this.orderModel.findById(line.orderId).lean<Order>().exec();
		if (!order) throw new NotFoundException(Message.NO_DATA_FOUND);

		// the buyer of the order is the only one who may return its lines
		if (String(order.memberId) !== String(memberId))
			throw new ForbiddenException(Message.NOT_ALLOWED_REQUEST);

		// a cart or a cancelled order was never a completed purchase
		if (![OrderStatus.PROCESS, OrderStatus.FINISH].includes(order.orderStatus))
			throw new BadRequestException(Message.RETURN_NOT_ELIGIBLE);

		return { line, order };
	}

	/** older orders predate purchasedAt, so fall back to updatedAt for them */
	private windowCloseDate(order: Order): Date {
		const anchor = order.purchasedAt ?? order.updatedAt;
		return moment(anchor).add(RETURN_WINDOW_DAYS, 'days').toDate();
	}

	private assertWithinWindow(order: Order): void {
		if (moment().isAfter(this.windowCloseDate(order)))
			throw new BadRequestException(Message.RETURN_WINDOW_EXPIRED);
	}

	/** how much of this line is already spoken for by a live return */
	private async claimedQuantity(orderItemId: ObjectId): Promise<number> {
		const rows = await this.returnModel
			.aggregate([
				{ $match: { orderItemId, returnStatus: { $in: CLAIMING_STATUSES } } },
				{ $group: { _id: null, total: { $sum: '$returnQuantity' } } },
			])
			.exec();
		return rows[0]?.total ?? 0;
	}

	private refundFor(line: OrderItem, quantity: number): number {
		const unit = line.itemPrice * (1 - (line.itemDiscount ?? 0) / 100);
		return Math.round(unit * quantity);
	}

	private sortOf(input: ReturnsInquiry | AllReturnsInquiry): T {
		return { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };
	}

	private async aggregateReturns(match: T, sort: T, page: number, limit: number): Promise<Returns> {
		const result = await this.returnModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							lookupMember,
							{ $unwind: '$memberData' },
							lookupReturnProduct,
							{ $unwind: '$productData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] ?? { list: [], metaCounter: [] };
	}
}
