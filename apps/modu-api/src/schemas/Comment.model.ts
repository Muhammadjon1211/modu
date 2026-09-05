import { Schema } from 'mongoose';
import { CommentGroup, CommentStatus } from '../libs/enums/comment.enum';

const CommentSchema = new Schema(
	{
		commentStatus: { type: String, enum: CommentStatus, default: CommentStatus.ACTIVE },
		commentGroup: { type: String, enum: CommentGroup, required: true },
		commentContent: { type: String, required: true },
		commentRefId: { type: Schema.Types.ObjectId, required: true },

		/** present only on product reviews — drives productRating */
		commentRating: { type: Number, min: 1, max: 5 },
		/** set when the writer is the seller answering on their own product */
		isSellerReply: { type: Boolean, default: false },

		memberId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
	},
	{ timestamps: true, collection: 'comments' },
);

/** one rating per member per product; unrated comments are exempt via the partial filter */
CommentSchema.index(
	{ memberId: 1, commentRefId: 1 },
	{ unique: true, partialFilterExpression: { commentRating: { $exists: true } } },
);

export default CommentSchema;
