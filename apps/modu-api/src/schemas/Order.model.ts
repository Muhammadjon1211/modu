import { Schema } from 'mongoose';
import { OrderStatus } from '../libs/enums/order.enum';

/**
 * The cart is an Order in PAUSE state — there is no separate cart collection,
 * so cart and order history share one aggregation path.
 */
const OrderSchema = new Schema(
	{
		orderStatus: { type: String, enum: OrderStatus, default: OrderStatus.PAUSE },
		/** always computed server-side from current prices — never trusted from the client */
		orderSubTotal: { type: Number, default: 0 },
		orderDelivery: { type: Number, default: 0 },
		orderTotal: { type: Number, default: 0 },

		memberId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' }, // the buyer
		/**
		 * When the cart actually became an order. The return window runs from here,
		 * never from createdAt — createdAt is when the cart was opened, and a cart
		 * can sit untouched for weeks before checkout.
		 */
		purchasedAt: { type: Date },
		deletedAt: { type: Date },
	},
	{ timestamps: true, collection: 'orders' },
);

/** a member has at most one open cart */
OrderSchema.index(
	{ memberId: 1, orderStatus: 1 },
	{ unique: true, partialFilterExpression: { orderStatus: OrderStatus.PAUSE } },
);

export default OrderSchema;
