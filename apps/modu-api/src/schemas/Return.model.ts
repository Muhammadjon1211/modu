import { Schema } from 'mongoose';
import { ReturnReason, ReturnStatus } from '../libs/enums/return.enum';

/**
 * One return per order line, not per order — a buyer returns the jacket that
 * did not fit and keeps the rest of the basket.
 */
const ReturnSchema = new Schema(
	{
		returnStatus: { type: String, enum: ReturnStatus, default: ReturnStatus.REQUEST },
		returnReason: { type: String, enum: ReturnReason, required: true },
		returnDesc: { type: String },
		returnImages: { type: [String], default: [] },
		returnQuantity: { type: Number, required: true },
		/** refund owed, computed server-side from the order line's price snapshot */
		returnAmount: { type: Number, required: true },

		memberId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' }, // the buyer
		sellerId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
		orderId: { type: Schema.Types.ObjectId, required: true, ref: 'Order' },
		orderItemId: { type: Schema.Types.ObjectId, required: true, ref: 'OrderItem' },
		productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },

		approvedAt: { type: Date },
		rejectedAt: { type: Date },
		completedAt: { type: Date },
		cancelledAt: { type: Date },
	},
	{ timestamps: true, collection: 'returns' },
);

/** the quantity-already-returned check and the buyer's own list both read through this */
ReturnSchema.index({ orderItemId: 1, returnStatus: 1 });
ReturnSchema.index({ memberId: 1, createdAt: -1 });
ReturnSchema.index({ sellerId: 1, returnStatus: 1 });

export default ReturnSchema;
