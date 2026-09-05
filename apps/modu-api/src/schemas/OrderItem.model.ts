import { Schema } from 'mongoose';

const OrderItemSchema = new Schema(
	{
		itemQuantity: { type: Number, required: true },
		/** price snapshot at purchase time — a later price edit must not rewrite history */
		itemPrice: { type: Number, required: true },
		itemDiscount: { type: Number, default: 0 },

		productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },
		/** the seller of this line — lets a seller query orders without unwinding products */
		sellerId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
		orderId: { type: Schema.Types.ObjectId, required: true, ref: 'Order' },
	},
	{ timestamps: true, collection: 'orderItems' },
);

OrderItemSchema.index({ orderId: 1, productId: 1 }, { unique: true });
OrderItemSchema.index({ sellerId: 1 });

export default OrderItemSchema;
