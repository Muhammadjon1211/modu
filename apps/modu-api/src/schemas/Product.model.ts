import { Schema } from 'mongoose';
import {
	ProductCategory,
	ProductColor,
	ProductFit,
	ProductGender,
	ProductGroup,
	ProductSeason,
	ProductSize,
	ProductStatus,
} from '../libs/enums/product.enum';

const ProductSchema = new Schema(
	{
		productCategory: { type: String, enum: ProductCategory, required: true },
		/** denormalized from the category so the two catalog tabs are one indexed match */
		productGroup: { type: String, enum: ProductGroup, required: true },
		productStatus: { type: String, enum: ProductStatus, default: ProductStatus.ACTIVE },
		productGender: { type: String, enum: ProductGender, required: true },
		productBrand: { type: String, required: true },
		productTitle: { type: String, required: true },
		productPrice: { type: Number, required: true },
		productDiscount: { type: Number, default: 0 },
		productStock: { type: Number, required: true },
		productSizes: { type: [String], enum: ProductSize, required: true },
		productColors: { type: [String], enum: ProductColor, required: true },
		productSeasons: { type: [String], enum: ProductSeason, default: [] },
		productFit: { type: String, enum: ProductFit, default: ProductFit.REGULAR },
		productImages: { type: [String], required: true },
		productDesc: { type: String },
		productMaterial: { type: String },
		productTags: { type: [String], default: [] },

		/** boolean facets — the "options" checkbox group */
		productOnSale: { type: Boolean, default: false },
		productFreeShipping: { type: Boolean, default: false },

		productViews: { type: Number, default: 0 },
		productLikes: { type: Number, default: 0 },
		productComments: { type: Number, default: 0 },
		productSales: { type: Number, default: 0 },
		productRating: { type: Number, default: 0 },
		productRatingCount: { type: Number, default: 0 },
		productRank: { type: Number, default: 0 },

		memberId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' }, // the seller
		soldOutAt: { type: Date },
		deletedAt: { type: Date },
	},
	{ timestamps: true, collection: 'products' },
);

/** duplicate-listing prevention for one seller */
ProductSchema.index(
	{ memberId: 1, productCategory: 1, productBrand: 1, productTitle: 1, productPrice: 1 },
	{ unique: true },
);

/** the two catalog tabs and the faceted browse both read through this */
ProductSchema.index({ productGroup: 1, productStatus: 1, productCategory: 1 });

export default ProductSchema;
