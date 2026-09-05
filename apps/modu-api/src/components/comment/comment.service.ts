import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { Comment, Comments } from '../../libs/dto/comment/comment';
import { CommentInput, CommentsInquiry } from '../../libs/dto/comment/comment.input';
import { CommentUpdate } from '../../libs/dto/comment/comment.update';
import { OrderItem } from '../../libs/dto/order/order';
import { Order } from '../../libs/dto/order/order';
import { CommentGroup, CommentStatus } from '../../libs/enums/comment.enum';
import { OrderStatus } from '../../libs/enums/order.enum';
import { Direction, Message } from '../../libs/enums/common.enum';
import { T } from '../../libs/types/common';
import { MemberService } from '../member/member.service';
import { ProductService } from '../product/product.service';
import { BoardArticleService } from '../board-article/board-article.service';
import { lookupMember } from '../../libs/config';

@Injectable()
export class CommentService {
	constructor(
		@InjectModel('Comment') private readonly commentModel: Model<Comment>,
		// read-only, so a purchase can be verified with one findOne
		@InjectModel('OrderItem') private readonly orderItemModel: Model<OrderItem>,
		@InjectModel('Order') private readonly orderModel: Model<Order>,
		private readonly memberService: MemberService,
		private readonly productService: ProductService,
		private readonly boardArticleService: BoardArticleService,
	) {}

	public async createComment(memberId: ObjectId, input: CommentInput): Promise<Comment> {
		input.memberId = memberId;

		// a rating makes this a review, and only a buyer may write one
		if (input.commentRating !== undefined) {
			if (input.commentGroup !== CommentGroup.PRODUCT)
				throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);
			const purchased = await this.hasPurchased(memberId, input.commentRefId);
			if (!purchased) throw new ForbiddenException(Message.NOT_PURCHASED_PRODUCT);
		}

		let result: Comment | null = null;
		try {
			result = await this.commentModel.create(input);
		} catch (err) {
			console.log('Error, Service.model:', err.message);
			throw new BadRequestException(Message.CREATE_FAILED);
		}

		switch (input.commentGroup) {
			case CommentGroup.PRODUCT:
				await this.productService.productStatsEditor({
					_id: input.commentRefId,
					targetKey: 'productComments',
					modifier: 1,
				});
				if (input.commentRating !== undefined) {
					await this.productService.productRatingEditor(input.commentRefId, input.commentRating);
				}
				break;
			case CommentGroup.ARTICLE:
				await this.boardArticleService.boardArticleStatsEditor({
					_id: input.commentRefId,
					targetKey: 'articleComments',
					modifier: 1,
				});
				break;
			case CommentGroup.MEMBER:
				await this.memberService.memberStatsEditor({
					_id: input.commentRefId,
					targetKey: 'memberComments',
					modifier: 1,
				});
				break;
		}

		if (!result) throw new BadRequestException(Message.CREATE_FAILED);
		return result;
	}

	/** a line item of this member's, on a finished order, for this product */
	private async hasPurchased(memberId: ObjectId, productId: ObjectId): Promise<boolean> {
		const orders = await this.orderModel
			.find({ memberId, orderStatus: { $in: [OrderStatus.PROCESS, OrderStatus.FINISH] } })
			.select('_id')
			.lean()
			.exec();
		if (!orders.length) return false;

		const line = await this.orderItemModel
			.findOne({ productId, orderId: { $in: orders.map((ele) => ele._id) } })
			.exec();
		return !!line;
	}

	public async updateComment(memberId: ObjectId, input: CommentUpdate): Promise<Comment> {
		const { _id } = input;
		const result = await this.commentModel
			.findOneAndUpdate({ _id, memberId, commentStatus: CommentStatus.ACTIVE }, input, { new: true })
			.exec();
		if (!result) throw new NotFoundException(Message.UPDATE_FAILED);
		return result;
	}

	public async getComments(memberId: ObjectId, input: CommentsInquiry): Promise<Comments> {
		const { commentRefId } = input.search;
		const match: T = { commentRefId, commentStatus: CommentStatus.ACTIVE };
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		const result = await this.commentModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupMember,
							{ $unwind: '$memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] ?? { list: [], metaCounter: [] };
	}

	/** ADMIN **/

	public async removeCommentByAdmin(commentId: ObjectId): Promise<Comment> {
		const result = await this.commentModel.findByIdAndDelete(commentId).exec();
		if (!result) throw new NotFoundException(Message.REMOVE_FAILED);
		return result;
	}
}
