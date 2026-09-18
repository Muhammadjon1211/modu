import { Schema } from 'mongoose';

/** a member's saved shipping addresses — an order keeps its own snapshot, never a reference */
const AddressSchema = new Schema(
	{
		recipientName: { type: String, required: true },
		recipientPhone: { type: String, required: true },
		addressLine1: { type: String, required: true },
		addressLine2: { type: String },
		city: { type: String, required: true },
		postalCode: { type: String },
		isDefault: { type: Boolean, default: false },

		memberId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
	},
	{ timestamps: true, collection: 'addresses' },
);

AddressSchema.index({ memberId: 1 });

export default AddressSchema;
