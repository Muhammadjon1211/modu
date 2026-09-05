import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import moment from 'moment';
import { Product, Products } from '../../libs/dto/product/product';
import {
	AllProductsInquiry,
	ProductInput,
	ProductsInquiry,
	SellerProductsInquiry,
} from '../../libs/dto/product/product.input';
import { ProductUpdate } from '../../libs/dto/product/product.update';
import { OrdinaryInquiry } from '../../libs/dto/member/member.input';
import { ProductStatus } from '../../libs/enums/product.enum';
import { Direction, Message } from '../../libs/enums/common.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { StatisticModifier, T } from '../../libs/types/common';
import { MemberService } from '../member/member.service';
import { ViewService } from '../view/view.service';
import { LikeService } from '../like/like.service';
import { groupOfCategory, lookupAuthMemberLiked, lookupMember, shapeIntoMongoObjectId } from '../../libs/config';

@Injectable()
export class ProductService {
	constructor(
		@InjectModel('Product') private readonly productModel: Model<Product>,
		private readonly memberService: MemberService,
		private readonly viewService: ViewService,
		private readonly likeService: LikeService,
	) {}

	public async createProduct(input: ProductInput): Promise<Product> {
		// the seller picks a leaf category; the catalog tab follows automatically
		input.productGroup = groupOfCategory(input.productCategory);
		input.productOnSale = (input.productDiscount ?? 0) > 0;

		try {
			const result = await this.productModel.create(input);
			await this.memberService.memberStatsEditor({
				_id: result.memberId,
				targetKey: 'memberProducts',
				modifier: 1,
			});
			return result;
		} catch (err) {
			console.log('Error, Service.model:', err.message);
			throw new BadRequestException(Message.CREATE_FAILED);
		}
	}

	public async getProduct(memberId: ObjectId | null, productId: ObjectId): Promise<Product> {
		const search: T = { _id: productId, productStatus: { $in: [ProductStatus.ACTIVE, ProductStatus.SOLD_OUT] } };
		const targetProduct = await this.productModel.findOne(search).lean<Product>().exec();
		if (!targetProduct) throw new NotFoundException(Message.NO_DATA_FOUND);

		if (memberId) {
			const viewInput = { memberId, viewRefId: productId, viewGroup: ViewGroup.PRODUCT };
			const newView = await this.viewService.recordView(viewInput);
			if (newView) {
				await this.productStatsEditor({ _id: productId, targetKey: 'productViews', modifier: 1 });
				targetProduct.productViews++; // keep the returned doc in sync
			}

			const likeInput = { memberId, likeRefId: productId, likeGroup: LikeGroup.PRODUCT };
			targetProduct.meLiked = await this.likeService.checkLikeExistence(likeInput);
		}

		// null as the viewer so fetching the seller does not record a view on them
		targetProduct.memberData = await this.memberService.getMember(null, targetProduct.memberId);
		return targetProduct;
	}

	public async updateProduct(memberId: ObjectId, input: ProductUpdate): Promise<Product> {
		const { productStatus } = input;
		// the filter is the authorization check — there is no separate policy layer
		const search: T = {
			_id: input._id,
			memberId: memberId,
			productStatus: { $in: [ProductStatus.ACTIVE, ProductStatus.SOLD_OUT] },
		};

		// terminal timestamps are stamped by the server, never accepted from the client
		if (productStatus === ProductStatus.SOLD_OUT) input.soldOutAt = moment().toDate();
		else if (productStatus === ProductStatus.DELETE) input.deletedAt = moment().toDate();

		if (input.productCategory) input.productGroup = groupOfCategory(input.productCategory);
		if (input.productDiscount !== undefined) input.productOnSale = input.productDiscount > 0;

		const result = await this.productModel.findOneAndUpdate(search, input, { new: true }).exec();
		if (!result) throw new NotFoundException(Message.UPDATE_FAILED);

		if (input.deletedAt) {
			await this.memberService.memberStatsEditor({
				_id: memberId,
				targetKey: 'memberProducts',
				modifier: -1,
			});
		}
		return result;
	}

	/** the public catalog — one Clothes tab, one Accessories tab, same code */
	public async getProducts(memberId: ObjectId, input: ProductsInquiry): Promise<Products> {
		const match: T = { productStatus: ProductStatus.ACTIVE };
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		this.shapeMatchQuery(match, input);
		console.log('match:', match);

		const result = await this.productModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						// skip/limit first so the lookups only run on the current page
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupAuthMemberLiked(memberId),
							lookupMember,
							{ $unwind: '$memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		// an empty browse page is not an error
		return result[0] ?? { list: [], metaCounter: [] };
	}

	private shapeMatchQuery(match: T, input: ProductsInquiry): void {
		const {
			memberId,
			group,
			categoryList,
			sizeList,
			colorList,
			genderList,
			seasonList,
			fitList,
			pricesRange,
			periodsRange,
			ratingFrom,
			inStockOnly,
			options,
			text,
		} = input.search;

		if (memberId) match.memberId = shapeIntoMongoObjectId(memberId);
		if (group) match.productGroup = group;
		if (categoryList) match.productCategory = { $in: categoryList };
		if (sizeList) match.productSizes = { $in: sizeList };
		if (colorList) match.productColors = { $in: colorList };
		if (genderList) match.productGender = { $in: genderList };
		if (seasonList) match.productSeasons = { $in: seasonList };
		if (fitList) match.productFit = { $in: fitList };

		if (pricesRange) match.productPrice = { $gte: pricesRange.start, $lte: pricesRange.end };
		if (periodsRange) match.createdAt = { $gte: periodsRange.start, $lte: periodsRange.end };
		if (ratingFrom) match.productRating = { $gte: ratingFrom };
		if (inStockOnly) match.productStock = { $gt: 0 };
		if (text) match.productTitle = { $regex: new RegExp(text, 'i') };

		if (options) match['$or'] = options.map((ele) => ({ [ele]: true }));
	}

	/** the seller's own list — Sold / Active / Out of stock / most sold / least sold */
	public async getSellerProducts(memberId: ObjectId, input: SellerProductsInquiry): Promise<Products> {
		const { productStatus, categoryList, text } = input.search;
		if (productStatus === ProductStatus.DELETE) throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);

		const match: T = {
			memberId: memberId,
			productStatus: productStatus ?? { $ne: ProductStatus.DELETE },
		};
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		if (categoryList) match.productCategory = { $in: categoryList };
		if (text) match.productTitle = { $regex: new RegExp(text, 'i') };

		const result = await this.productModel
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

	public async getFavorites(memberId: ObjectId, input: OrdinaryInquiry): Promise<Products> {
		return await this.likeService.getFavoriteProducts(memberId, input);
	}

	public async getVisited(memberId: ObjectId, input: OrdinaryInquiry): Promise<Products> {
		return await this.viewService.getVisitedProducts(memberId, input);
	}

	public async likeTargetProduct(memberId: ObjectId, likeRefId: ObjectId): Promise<Product> {
		const target: Product | null = await this.productModel
			.findOne({ _id: likeRefId, productStatus: ProductStatus.ACTIVE })
			.exec();
		if (!target) throw new NotFoundException(Message.NO_DATA_FOUND);

		const modifier: number = await this.likeService.toggleLike({
			memberId,
			likeRefId,
			likeGroup: LikeGroup.PRODUCT,
		});
		const result = await this.productStatsEditor({ _id: likeRefId, targetKey: 'productLikes', modifier });
		if (!result) throw new BadRequestException(Message.SOMETHING_WENT_WRONG);
		return result;
	}

	/** same category as the current product, itself excluded */
	public async getRelatedProducts(productId: ObjectId, limit: number): Promise<Products> {
		const target = await this.productModel.findById(productId).lean<Product>().exec();
		if (!target) throw new NotFoundException(Message.NO_DATA_FOUND);

		const list = await this.productModel
			.aggregate([
				{
					$match: {
						_id: { $ne: target._id },
						productCategory: target.productCategory,
						productStatus: ProductStatus.ACTIVE,
					},
				},
				{ $sort: { productRank: Direction.DESC } },
				{ $limit: limit },
				lookupMember,
				{ $unwind: '$memberData' },
			])
			.exec();

		return { list, metaCounter: [{ total: list.length }] };
	}

	/**
	 * Conditional decrement — the stock check IS the filter, so two concurrent
	 * checkouts can never both pass it.
	 */
	public async decrementStock(productId: ObjectId, quantity: number): Promise<Product> {
		const result = await this.productModel
			.findOneAndUpdate(
				{ _id: productId, productStatus: ProductStatus.ACTIVE, productStock: { $gte: quantity } },
				{ $inc: { productStock: -quantity, productSales: quantity } },
				{ new: true },
			)
			.exec();
		if (!result) throw new BadRequestException(Message.NOT_ENOUGH_STOCK);

		if (result.productStock === 0) {
			await this.productModel
				.findByIdAndUpdate(productId, { productStatus: ProductStatus.SOLD_OUT, soldOutAt: moment().toDate() })
				.exec();
		}
		return result;
	}

	/** the mirror image, used when an order is cancelled */
	public async restoreStock(productId: ObjectId, quantity: number): Promise<void> {
		const target = await this.productModel
			.findByIdAndUpdate(
				productId,
				{ $inc: { productStock: quantity, productSales: -quantity } },
				{ new: true },
			)
			.exec();
		if (!target) return;

		if (target.productStock > 0 && target.productStatus === ProductStatus.SOLD_OUT) {
			await this.productModel
				.findByIdAndUpdate(productId, { productStatus: ProductStatus.ACTIVE, soldOutAt: null })
				.exec();
		}
	}

	/** running average — one write, no re-scan of the comments collection */
	public async productRatingEditor(productId: ObjectId, rating: number): Promise<Product | null> {
		const target = await this.productModel.findById(productId).exec();
		if (!target) return null;

		const count = target.productRatingCount + 1;
		const average = (target.productRating * target.productRatingCount + rating) / count;

		return await this.productModel
			.findByIdAndUpdate(
				productId,
				{ productRatingCount: count, productRating: Math.round(average * 100) / 100 },
				{ new: true },
			)
			.exec();
	}

	/** ADMIN **/

	public async getAllProductsByAdmin(input: AllProductsInquiry): Promise<Products> {
		const { productStatus, categoryList, text } = input.search;
		const match: T = {};
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		if (productStatus) match.productStatus = productStatus;
		if (categoryList) match.productCategory = { $in: categoryList };
		if (text) match.productTitle = { $regex: new RegExp(text, 'i') };

		const result = await this.productModel
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

	public async updateProductByAdmin(input: ProductUpdate): Promise<Product> {
		const { productStatus } = input;
		const search: T = {
			_id: input._id,
			productStatus: { $in: [ProductStatus.ACTIVE, ProductStatus.SOLD_OUT] },
		};

		if (productStatus === ProductStatus.SOLD_OUT) input.soldOutAt = moment().toDate();
		else if (productStatus === ProductStatus.DELETE) input.deletedAt = moment().toDate();

		if (input.productCategory) input.productGroup = groupOfCategory(input.productCategory);

		const result = await this.productModel.findOneAndUpdate(search, input, { new: true }).exec();
		if (!result) throw new NotFoundException(Message.UPDATE_FAILED);

		if (input.deletedAt) {
			await this.memberService.memberStatsEditor({
				_id: result.memberId,
				targetKey: 'memberProducts',
				modifier: -1,
			});
		}
		return result;
	}

	/** the one explicit hard delete in the app */
	public async removeProductByAdmin(productId: ObjectId): Promise<Product> {
		const search: T = { _id: productId, productStatus: ProductStatus.DELETE };
		const result = await this.productModel.findOneAndDelete(search).exec();
		if (!result) throw new NotFoundException(Message.REMOVE_FAILED);
		return result;
	}

	public async productStatsEditor(input: StatisticModifier): Promise<Product | null> {
		const { _id, targetKey, modifier } = input;
		return await this.productModel
			.findByIdAndUpdate(_id, { $inc: { [targetKey]: modifier } }, { new: true })
			.exec();
	}
}
