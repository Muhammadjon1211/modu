import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import moment from 'moment';
import { Product } from '../../libs/dto/product/product';
import { Recommendations } from '../../libs/dto/recommendation/recommendation';
import { ProductGender, ProductStatus } from '../../libs/enums/product.enum';
import { OrderStatus } from '../../libs/enums/order.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { T } from '../../libs/types/common';
import {
	lookupAuthMemberLiked,
	lookupMember,
	lookupOrderItems,
	RECOMMEND_BADGE_MAX,
	RECOMMEND_BADGE_SHARE,
	RECOMMEND_CACHE_TTL_MS,
	RECOMMEND_DECAY_DAYS,
	RECOMMEND_SIGNAL_WEIGHTS,
	RECOMMEND_TRENDING_DAYS,
	shapeIntoMongoObjectId,
} from '../../libs/config';

/** productId -> decayed signal weight */
type Interactions = Map<string, number>;
/** sparse feature vector: "c:TOP" -> weight */
type Vector = Map<string, number>;

interface MemberSignals {
	weights: Interactions;
	/** liked, in the cart or bought — never recommended back */
	engaged: Set<string>;
}

interface Ranking {
	ids: string[];
	badged: Set<string>;
	personalized: boolean;
}

interface CacheEntry {
	ranking: Promise<Ranking>;
	expiresAt: number;
}

/** how much each product attribute says about taste */
const FEATURE_WEIGHTS = { category: 3, gender: 2.5, brand: 1.5, seller: 1, color: 1, fit: 0.5, season: 0.5, tag: 0.5 };
/** final blend: taste match, similar shoppers, popularity, followed shops */
const SCORE_WEIGHTS = { content: 0.5, collab: 0.3, popularity: 0.15, followed: 0.1 };
/** a product already viewed but not engaged with ranks a little lower */
const SEEN_PENALTY = 0.85;
/** each extra pick from the same category is damped — keeps the list varied */
const DIVERSITY_DAMPING = 0.85;
const MIN_BADGE_SCORE = 0.2;
const MAX_NEIGHBORS = 200;
const MAX_CANDIDATES = 2000;
/** only the head of the list is re-ranked for variety; the tail keeps raw score order */
const DIVERSIFY_HEAD = 100;
const TRENDING_KEY = '__trending__';

const PURCHASED = [OrderStatus.PROCESS, OrderStatus.FINISH];

/**
 * Personal recommendations without any paid AI service: a hybrid of
 * content-based filtering (a taste profile built from the member's own views,
 * likes, cart and purchases), user-based collaborative filtering (what members
 * with overlapping activity engaged with) and a popularity prior.
 * Members with no activity get trending products, topped up with best sellers.
 */
@Injectable()
export class RecommendationService {
	private readonly cache = new Map<string, CacheEntry>();

	constructor(
		@InjectModel('Product') private readonly productModel: Model<Product>,
		@InjectModel('View') private readonly viewModel: Model<T>,
		@InjectModel('Like') private readonly likeModel: Model<T>,
		@InjectModel('Follow') private readonly followModel: Model<T>,
		@InjectModel('Order') private readonly orderModel: Model<T>,
		@InjectModel('OrderItem') private readonly orderItemModel: Model<T>,
	) {}

	public async getRecommendations(memberId: ObjectId | null, limit: number): Promise<Recommendations> {
		let ranking = memberId ? await this.getRanking(memberId) : null;
		if (!ranking?.personalized) ranking = await this.getTrending();

		const ids = ranking.ids.slice(0, limit);
		const list = await this.hydrate(memberId, ids);
		if (ranking.personalized)
			list.forEach((product) => (product.meRecommended = ranking.badged.has(String(product._id))));

		return { list, personalized: ranking.personalized };
	}

	/** stamps `meRecommended` on a page of products the viewer is browsing */
	public async markRecommended(memberId: ObjectId | null, list: Product[]): Promise<void> {
		if (!memberId || !list?.length) return;
		const { badged, personalized } = await this.getRanking(memberId);
		if (!personalized) return;
		list.forEach((product) => (product.meRecommended = badged.has(String(product._id))));
	}

	/**
	 * Called when the member does something that should change their picks right away.
	 * The new ranking starts computing now, in the background, so the next page they open
	 * reads it from the cache instead of waiting for it.
	 */
	public invalidate(memberId: ObjectId): void {
		this.cache.delete(String(memberId));
		this.getRanking(memberId).catch((err) => console.log('Error, recommendation prewarm:', err.message));
	}

	/** concurrent callers (every home page section) share one in-flight computation */
	private getRanking(memberId: ObjectId): Promise<Ranking> {
		return this.cached(String(memberId), () => this.rankForMember(memberId));
	}

	private getTrending(): Promise<Ranking> {
		return this.cached(TRENDING_KEY, () => this.rankTrending());
	}

	private cached(key: string, compute: () => Promise<Ranking>): Promise<Ranking> {
		const hit = this.cache.get(key);
		if (hit && hit.expiresAt > Date.now()) return hit.ranking;

		const ranking = compute().catch((err) => {
			this.cache.delete(key); // never cache a failure
			throw err;
		});
		this.cache.set(key, { ranking, expiresAt: Date.now() + RECOMMEND_CACHE_TTL_MS });
		return ranking;
	}

	/* ------------------------------------------------------------------ */
	/* PERSONAL RANKING                                                    */
	/* ------------------------------------------------------------------ */

	private async rankForMember(memberId: ObjectId): Promise<Ranking> {
		const me = String(memberId);
		const [signalsByMember, followedIds] = await Promise.all([
			this.collectSignals([memberId]),
			this.followModel.distinct('followingId', { followerId: memberId }).exec(),
		]);
		const mine = signalsByMember.get(me) ?? { weights: new Map(), engaged: new Set<string>() };
		const followed = new Set(followedIds.map(String));

		if (!mine.weights.size && !followed.size) return { ids: [], badged: new Set(), personalized: false };

		const seedIds = [...mine.weights.keys()];
		const [seedProducts, candidates, collab] = await Promise.all([
			this.productModel
				.find({ _id: { $in: seedIds } })
				.lean<Product[]>()
				.exec(),
			this.productModel
				.find({ productStatus: ProductStatus.ACTIVE, productStock: { $gt: 0 } })
				.sort({ productRank: -1 })
				.limit(MAX_CANDIDATES)
				.lean<Product[]>()
				.exec(),
			this.collaborativeScores(memberId, mine),
		]);

		const profile = this.buildProfile(seedProducts, mine.weights);
		const price = this.priceTaste(seedProducts, mine.weights);
		const maxPopularity = Math.max(1e-9, ...candidates.map((p) => this.popularity(p)));

		const scored: { product: Product; score: number }[] = [];
		for (const product of candidates) {
			const id = String(product._id);
			if (mine.engaged.has(id)) continue;
			if (String(product.memberId) === me) continue; // a seller is never shown their own listings

			const taste = profile.size ? this.cosine(profile, this.vectorize(product)) : 0;
			const priceFit = price ? this.priceFit(product, price) : 0;
			const content = 0.85 * taste + 0.15 * priceFit;

			let score =
				SCORE_WEIGHTS.content * content +
				SCORE_WEIGHTS.collab * (collab.get(id) ?? 0) +
				SCORE_WEIGHTS.popularity * (this.popularity(product) / maxPopularity) +
				(followed.has(String(product.memberId)) ? SCORE_WEIGHTS.followed : 0);
			if (mine.weights.has(id)) score *= SEEN_PENALTY;

			scored.push({ product, score });
		}

		const ranked = this.diversify(scored);
		const badgeCount = Math.min(RECOMMEND_BADGE_MAX, Math.ceil(candidates.length * RECOMMEND_BADGE_SHARE));
		const badged = new Set(
			ranked
				.slice(0, badgeCount)
				.filter((item) => item.score >= MIN_BADGE_SCORE)
				.map((item) => String(item.product._id)),
		);

		return { ids: ranked.map((item) => String(item.product._id)), badged, personalized: ranked.length > 0 };
	}

	/** views, likes, cart lines and purchases for each member, decayed by age */
	private async collectSignals(memberIds: ObjectId[]): Promise<Map<string, MemberSignals>> {
		const result = new Map<string, MemberSignals>();
		const now = Date.now();

		const add = (memberId: T, productId: T, weight: number, at: Date, engaged: boolean) => {
			const key = String(memberId);
			const signals = result.get(key) ?? { weights: new Map(), engaged: new Set<string>() };
			const ageDays = Math.max(0, (now - new Date(at ?? now).getTime()) / 86_400_000);
			const decayed = weight * Math.exp(-ageDays / RECOMMEND_DECAY_DAYS);
			const id = String(productId);

			signals.weights.set(id, (signals.weights.get(id) ?? 0) + decayed);
			if (engaged) signals.engaged.add(id);
			result.set(key, signals);
		};

		const [views, likes, orderLines] = await Promise.all([
			this.viewModel
				.find({ viewGroup: ViewGroup.PRODUCT, memberId: { $in: memberIds } })
				.select('memberId viewRefId createdAt')
				.lean<T[]>()
				.exec(),
			this.likeModel
				.find({ likeGroup: LikeGroup.PRODUCT, memberId: { $in: memberIds } })
				.select('memberId likeRefId createdAt')
				.lean<T[]>()
				.exec(),
			this.orderModel
				.aggregate([
					{
						$match: {
							memberId: { $in: memberIds },
							orderStatus: { $in: [OrderStatus.PAUSE, ...PURCHASED] },
						},
					},
					lookupOrderItems,
					{ $unwind: '$orderItems' },
					{
						$project: {
							memberId: 1,
							orderStatus: 1,
							productId: '$orderItems.productId',
							at: { $ifNull: ['$purchasedAt', '$orderItems.updatedAt'] },
						},
					},
				])
				.exec(),
		]);

		views.forEach((v) => add(v.memberId, v.viewRefId, RECOMMEND_SIGNAL_WEIGHTS.VIEW, v.createdAt, false));
		likes.forEach((l) => add(l.memberId, l.likeRefId, RECOMMEND_SIGNAL_WEIGHTS.LIKE, l.createdAt, true));
		orderLines.forEach((o) => {
			const weight =
				o.orderStatus === OrderStatus.PAUSE ? RECOMMEND_SIGNAL_WEIGHTS.CART : RECOMMEND_SIGNAL_WEIGHTS.PURCHASE;
			add(o.memberId, o.productId, weight, o.at, true);
		});

		return result;
	}

	/**
	 * User-based collaborative filtering: members who touched the same products
	 * are neighbours, weighted by how similar their activity is to ours; the
	 * products they engaged with score in proportion. Normalized to 0..1.
	 */
	private async collaborativeScores(memberId: ObjectId, mine: MemberSignals): Promise<Map<string, number>> {
		const scores = new Map<string, number>();
		if (!mine.weights.size) return scores;

		const neighborIds = await this.findNeighbors(memberId, [...mine.weights.keys()]);
		if (!neighborIds.length) return scores;

		const neighbors = await this.collectSignals(neighborIds);
		for (const signals of neighbors.values()) {
			const similarity = this.cosine(mine.weights, signals.weights);
			if (similarity <= 0) continue;
			signals.weights.forEach((weight, productId) => {
				if (mine.engaged.has(productId)) return;
				scores.set(productId, (scores.get(productId) ?? 0) + similarity * weight);
			});
		}

		const max = Math.max(1e-9, ...scores.values());
		scores.forEach((value, key) => scores.set(key, value / max));
		return scores;
	}

	private async findNeighbors(memberId: ObjectId, productIds: string[]): Promise<ObjectId[]> {
		const seeds = productIds.map(shapeIntoMongoObjectId);

		const [viewers, likers, buyers] = await Promise.all([
			this.viewModel
				.distinct('memberId', { viewGroup: ViewGroup.PRODUCT, viewRefId: { $in: seeds }, memberId: { $ne: memberId } })
				.exec(),
			this.likeModel
				.distinct('memberId', { likeGroup: LikeGroup.PRODUCT, likeRefId: { $in: seeds }, memberId: { $ne: memberId } })
				.exec(),
			this.orderItemModel
				.aggregate([
					{ $match: { productId: { $in: seeds } } },
					{ $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'order' } },
					{ $unwind: '$order' },
					{ $match: { 'order.memberId': { $ne: memberId }, 'order.orderStatus': { $in: PURCHASED } } },
					{ $group: { _id: '$order.memberId' } },
					{ $limit: MAX_NEIGHBORS },
				])
				.exec(),
		]);

		const unique = new Map<string, ObjectId>();
		[...viewers, ...likers, ...buyers.map((b) => b._id)].forEach((id) => unique.set(String(id), id));
		return [...unique.values()].slice(0, MAX_NEIGHBORS);
	}

	/* ------------------------------------------------------------------ */
	/* TRENDING — guests and members with no activity yet                  */
	/* ------------------------------------------------------------------ */

	private async rankTrending(): Promise<Ranking> {
		const since = moment().subtract(RECOMMEND_TRENDING_DAYS, 'days').toDate();

		const [views, likes, sales] = await Promise.all([
			this.viewModel
				.aggregate([
					{ $match: { viewGroup: ViewGroup.PRODUCT, createdAt: { $gte: since } } },
					{ $group: { _id: '$viewRefId', count: { $sum: 1 } } },
				])
				.exec(),
			this.likeModel
				.aggregate([
					{ $match: { likeGroup: LikeGroup.PRODUCT, createdAt: { $gte: since } } },
					{ $group: { _id: '$likeRefId', count: { $sum: 1 } } },
				])
				.exec(),
			this.orderItemModel
				.aggregate([
					{ $match: { createdAt: { $gte: since } } },
					{ $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'order' } },
					{ $unwind: '$order' },
					{ $match: { 'order.orderStatus': { $in: PURCHASED } } },
					{ $group: { _id: '$productId', count: { $sum: '$itemQuantity' } } },
				])
				.exec(),
		]);

		const heat = new Map<string, number>();
		const add = (rows: T[], weight: number) =>
			rows.forEach((row) => heat.set(String(row._id), (heat.get(String(row._id)) ?? 0) + row.count * weight));
		add(views, RECOMMEND_SIGNAL_WEIGHTS.VIEW);
		add(likes, RECOMMEND_SIGNAL_WEIGHTS.LIKE);
		add(sales, RECOMMEND_SIGNAL_WEIGHTS.PURCHASE);

		const available = { productStatus: ProductStatus.ACTIVE, productStock: { $gt: 0 } };
		const hot = await this.productModel
			.find({ ...available, _id: { $in: [...heat.keys()] } })
			.select('_id')
			.lean<Product[]>()
			.exec();
		const trendingIds = hot.map((p) => String(p._id)).sort((a, b) => heat.get(b)! - heat.get(a)!);

		// best sellers fill whatever the last two weeks did not
		const bestSellers = await this.productModel
			.find({ ...available, _id: { $nin: trendingIds } })
			.sort({ productSales: -1, productRank: -1, productLikes: -1 })
			.limit(24)
			.select('_id')
			.lean<Product[]>()
			.exec();

		return {
			ids: [...trendingIds, ...bestSellers.map((p) => String(p._id))],
			badged: new Set(),
			personalized: false,
		};
	}

	/* ------------------------------------------------------------------ */
	/* SCORING HELPERS                                                     */
	/* ------------------------------------------------------------------ */

	private vectorize(product: Product): Vector {
		const vector: Vector = new Map();
		const put = (key: string, weight: number) => vector.set(key, (vector.get(key) ?? 0) + weight);
		const spread = (prefix: string, values: string[] | undefined, weight: number) =>
			values?.forEach((value) => put(`${prefix}:${value.toLowerCase()}`, weight / values.length));

		put(`c:${product.productCategory}`, FEATURE_WEIGHTS.category);
		// unisex pieces fit both a men's and a women's profile
		if (product.productGender === ProductGender.UNISEX) {
			put(`g:${ProductGender.MEN}`, FEATURE_WEIGHTS.gender / 2);
			put(`g:${ProductGender.WOMEN}`, FEATURE_WEIGHTS.gender / 2);
		} else put(`g:${product.productGender}`, FEATURE_WEIGHTS.gender);
		if (product.productBrand) put(`b:${product.productBrand.trim().toLowerCase()}`, FEATURE_WEIGHTS.brand);
		put(`s:${String(product.memberId)}`, FEATURE_WEIGHTS.seller);
		if (product.productFit) put(`f:${product.productFit}`, FEATURE_WEIGHTS.fit);
		spread('col', product.productColors, FEATURE_WEIGHTS.color);
		spread('sea', product.productSeasons, FEATURE_WEIGHTS.season);
		spread('t', product.productTags, FEATURE_WEIGHTS.tag);
		return vector;
	}

	/** the taste profile: every product the member touched, weighted by the signal */
	private buildProfile(products: Product[], weights: Interactions): Vector {
		const profile: Vector = new Map();
		for (const product of products) {
			const weight = weights.get(String(product._id)) ?? 0;
			this.vectorize(product).forEach((value, key) => profile.set(key, (profile.get(key) ?? 0) + value * weight));
		}
		return profile;
	}

	/** weighted mean and spread of log sale price across what the member engaged with */
	private priceTaste(products: Product[], weights: Interactions): { mean: number; sigma: number } | null {
		let total = 0;
		let sum = 0;
		let sumSq = 0;
		for (const product of products) {
			const weight = weights.get(String(product._id)) ?? 0;
			const logPrice = Math.log(Math.max(1, this.salePrice(product)));
			total += weight;
			sum += weight * logPrice;
			sumSq += weight * logPrice * logPrice;
		}
		if (!total) return null;
		const mean = sum / total;
		const variance = Math.max(0, sumSq / total - mean * mean);
		return { mean, sigma: Math.max(0.35, Math.sqrt(variance)) };
	}

	private priceFit(product: Product, taste: { mean: number; sigma: number }): number {
		const distance = Math.log(Math.max(1, this.salePrice(product))) - taste.mean;
		return Math.exp(-(distance * distance) / (2 * taste.sigma * taste.sigma));
	}

	private salePrice(product: Product): number {
		return product.productPrice * (1 - (product.productDiscount ?? 0) / 100);
	}

	private popularity(product: Product): number {
		const activity = Math.log1p(
			product.productSales * 3 + product.productLikes * 2 + product.productViews * 0.2 + product.productRatingCount,
		);
		return activity * (0.8 + 0.04 * (product.productRating ?? 0));
	}

	private cosine(a: Map<string, number>, b: Map<string, number>): number {
		let dot = 0;
		let normA = 0;
		let normB = 0;
		a.forEach((value, key) => {
			normA += value * value;
			const other = b.get(key);
			if (other) dot += value * other;
		});
		b.forEach((value) => (normB += value * value));
		return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
	}

	/** greedy re-rank: each repeat of a category is damped so one category cannot fill the list */
	private diversify(scored: { product: Product; score: number }[]): { product: Product; score: number }[] {
		const sorted = [...scored].sort((a, b) => b.score - a.score);
		const remaining = sorted.slice(0, DIVERSIFY_HEAD);
		const tail = sorted.slice(DIVERSIFY_HEAD);
		const picked: { product: Product; score: number }[] = [];
		const perCategory = new Map<string, number>();

		while (remaining.length) {
			let bestIndex = 0;
			let bestValue = -Infinity;
			remaining.forEach((item, index) => {
				const repeats = perCategory.get(item.product.productCategory) ?? 0;
				const value = item.score * Math.pow(DIVERSITY_DAMPING, repeats);
				if (value > bestValue) {
					bestValue = value;
					bestIndex = index;
				}
			});
			const [best] = remaining.splice(bestIndex, 1);
			perCategory.set(best.product.productCategory, (perCategory.get(best.product.productCategory) ?? 0) + 1);
			picked.push(best);
		}
		return [...picked, ...tail];
	}

	/** full product cards in ranking order */
	private async hydrate(memberId: ObjectId | null, ids: string[]): Promise<Product[]> {
		if (!ids.length) return [];
		const docs = await this.productModel
			.aggregate([
				{ $match: { _id: { $in: ids.map(shapeIntoMongoObjectId) } } },
				lookupAuthMemberLiked(memberId as T), // null for guests: meLiked comes back empty
				lookupMember,
				{ $unwind: '$memberData' },
			])
			.exec();
		const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
		return ids.map((id) => byId.get(id)).filter(Boolean);
	}
}
