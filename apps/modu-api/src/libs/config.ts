import { ObjectId } from 'mongoose';
import { ObjectId as BsonObjectId } from 'bson';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { T } from './types/common';
import { ProductCategory, ProductGroup } from './enums/product.enum';

/* ------------------------------------------------------------------ */
/* 1. SORT WHITELISTS — referenced by @IsIn() in every Inquiry DTO     */
/* ------------------------------------------------------------------ */
export const availableMemberSorts = ['createdAt', 'updatedAt', 'memberLikes', 'memberViews'];

export const availableSellerSorts = ['createdAt', 'updatedAt', 'memberLikes', 'memberViews', 'memberRank'];

export const availableProductSorts = [
	'createdAt',
	'updatedAt',
	'productLikes',
	'productViews',
	'productRank',
	'productPrice',
	'productSales',
	'productRating',
];

export const availableBoardArticleSorts = ['createdAt', 'updatedAt', 'articleLikes', 'articleViews'];

export const availableCommentSorts = ['createdAt', 'updatedAt'];

export const availableOrderSorts = ['createdAt', 'updatedAt', 'orderTotal'];

export const availableReturnSorts = ['createdAt', 'updatedAt', 'returnAmount'];

/**
 * How long after purchase a buyer may open a return.
 * Change this in one place; every eligibility check reads it.
 */
export const RETURN_WINDOW_DAYS = 3;

/**
 * Recommendation tuning — every knob the recommender reads lives here.
 * Signal weights rank how much each action says about taste: a purchase beats
 * a cart line beats a like beats a view.
 */
export const RECOMMEND_SIGNAL_WEIGHTS = { VIEW: 1, LIKE: 3, CART: 4, PURCHASE: 5 };
/** a signal loses ~63% of its weight after this many days */
export const RECOMMEND_DECAY_DAYS = 45;
/** how far back "trending" looks for guests and new members */
export const RECOMMEND_TRENDING_DAYS = 14;
/** per-member ranking is cached this long; a like drops the cache early */
export const RECOMMEND_CACHE_TTL_MS = 10 * 60 * 1000;
/** badge at most this many cards, and never more than this share of the catalog */
export const RECOMMEND_BADGE_MAX = 8;
export const RECOMMEND_BADGE_SHARE = 0.25;

/** Boolean facets — the "options" checkbox group. */
export const availableOptions = ['productOnSale', 'productFreeShipping', 'productNew'];

/* ------------------------------------------------------------------ */
/* 2. CATEGORY TAXONOMY — a leaf category always resolves to one group */
/* ------------------------------------------------------------------ */
export const categoryGroupMap: Record<ProductCategory, ProductGroup> = {
	[ProductCategory.TOP]: ProductGroup.CLOTHES,
	[ProductCategory.BOTTOM]: ProductGroup.CLOTHES,
	[ProductCategory.OUTERWEAR]: ProductGroup.CLOTHES,
	[ProductCategory.DRESS]: ProductGroup.CLOTHES,
	[ProductCategory.ACTIVEWEAR]: ProductGroup.CLOTHES,
	[ProductCategory.UNDERWEAR]: ProductGroup.CLOTHES,
	[ProductCategory.SHOES]: ProductGroup.CLOTHES,
	[ProductCategory.BAG]: ProductGroup.ACCESSORIES,
	[ProductCategory.HAT]: ProductGroup.ACCESSORIES,
	[ProductCategory.BELT]: ProductGroup.ACCESSORIES,
	[ProductCategory.JEWELRY]: ProductGroup.ACCESSORIES,
	[ProductCategory.SCARF]: ProductGroup.ACCESSORIES,
	[ProductCategory.SUNGLASSES]: ProductGroup.ACCESSORIES,
	[ProductCategory.OTHER_ACCESSORY]: ProductGroup.ACCESSORIES,
};

/**
 * The seller only ever picks a leaf category; the tab a product appears under
 * follows automatically. Single-sourcing the taxonomy makes mis-tabbing impossible.
 */
export const groupOfCategory = (category: ProductCategory): ProductGroup => categoryGroupMap[category];

/* ------------------------------------------------------------------ */
/* 3. IMAGE CONFIGURATION                                             */
/* ------------------------------------------------------------------ */
export const validMimeTypes = ['image/png', 'image/jpg', 'image/jpeg'];
export const validImageExtensions = ['.png', '.jpg', '.jpeg'];

export const isValidImage = (filename: string, mimetype?: string): boolean => {
	// Some clients (Postman, Altair, curl) send "application/octet-stream" or an empty
	// content-type for the file part, so fall back to the file extension.
	const mime = (mimetype ?? '').split(';')[0].trim().toLowerCase();
	if (validMimeTypes.includes(mime)) return true;
	const ext = path.parse(filename ?? '').ext.toLowerCase();
	return validImageExtensions.includes(ext);
};

export const getSerialForImage = (filename: string): string => uuidv4() + path.parse(filename).ext;

/* ------------------------------------------------------------------ */
/* 4. MONGO HELPER — string id from GraphQL -> real ObjectId          */
/* ------------------------------------------------------------------ */
export const shapeIntoMongoObjectId = (target: any): any =>
	typeof target === 'string' ? new BsonObjectId(target) : target;

/* ------------------------------------------------------------------ */
/* 5. REUSABLE $lookup FRAGMENTS                                      */
/* ------------------------------------------------------------------ */
export const lookupMember = {
	$lookup: { from: 'members', localField: 'memberId', foreignField: '_id', as: 'memberData' },
};

export const lookupAuthMemberLiked = (memberId: T, targetRefId: string = '$_id') => ({
	$lookup: {
		from: 'likes',
		let: { localLikeRefId: targetRefId, localMemberId: memberId, localMyFavorite: true },
		pipeline: [
			{
				$match: {
					$expr: {
						$and: [{ $eq: ['$likeRefId', '$$localLikeRefId'] }, { $eq: ['$memberId', '$$localMemberId'] }],
					},
				},
			},
			{ $project: { _id: 0, memberId: 1, likeRefId: 1, myFavorite: '$$localMyFavorite' } },
		],
		as: 'meLiked',
	},
});

interface LookupAuthMemberFollowed {
	followerId: T;
	followingId: string;
}

export const lookupAuthMemberFollowed = ({ followerId, followingId }: LookupAuthMemberFollowed) => ({
	$lookup: {
		from: 'follows',
		let: { localFollowerId: followerId, localFollowingId: followingId, localMyFavorite: true },
		pipeline: [
			{
				$match: {
					$expr: {
						$and: [{ $eq: ['$followerId', '$$localFollowerId'] }, { $eq: ['$followingId', '$$localFollowingId'] }],
					},
				},
			},
			{ $project: { _id: 0, followerId: 1, followingId: 1, myFavorite: '$$localMyFavorite' } },
		],
		as: 'meFollowed',
	},
});

export const lookupFollowingData = {
	$lookup: { from: 'members', localField: 'followingId', foreignField: '_id', as: 'followingData' },
};

export const lookupFollowerData = {
	$lookup: { from: 'members', localField: 'followerId', foreignField: '_id', as: 'followerData' },
};

export const lookupFavorite = {
	$lookup: {
		from: 'members',
		localField: 'favoriteProduct.memberId',
		foreignField: '_id',
		as: 'favoriteProduct.memberData',
	},
};

export const lookupVisit = {
	$lookup: {
		from: 'members',
		localField: 'visitedProduct.memberId',
		foreignField: '_id',
		as: 'visitedProduct.memberData',
	},
};

/** Order lines and the products behind them. */
export const lookupOrderItems = {
	$lookup: { from: 'orderItems', localField: '_id', foreignField: 'orderId', as: 'orderItems' },
};

export const lookupOrderProducts = {
	$lookup: { from: 'products', localField: 'orderItems.productId', foreignField: '_id', as: 'productData' },
};

/** the product a return is about, and the buyer who opened it */
export const lookupReturnProduct = {
	$lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'productData' },
};

/** Re-export the mongoose ObjectId type so DTOs import ids from one source. */
export type { ObjectId };
