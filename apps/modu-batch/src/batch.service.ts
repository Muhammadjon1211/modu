import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product } from 'apps/modu-api/src/libs/dto/product/product';
import { Member } from 'apps/modu-api/src/libs/dto/member/member';
import { ProductStatus } from 'apps/modu-api/src/libs/enums/product.enum';
import { MemberStatus, MemberType } from 'apps/modu-api/src/libs/enums/member.enum';

@Injectable()
export class BatchService {
	constructor(
		@InjectModel('Product') private readonly productModel: Model<Product>,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
	) {}

	/** 1. Reset every rank to 0 so the ranking jobs have a clean slate. */
	public async batchRollback(): Promise<void> {
		await this.productModel
			.updateMany({ productStatus: ProductStatus.ACTIVE }, { productRank: 0 })
			.exec();
		await this.memberModel
			.updateMany({ memberStatus: MemberStatus.ACTIVE, memberType: MemberType.SELLER }, { memberRank: 0 })
			.exec();
	}

	/**
	 * 2. Weighted popularity for products. Sales weigh heaviest — this is a shop,
	 * not a feed, so what sold matters more than what was looked at.
	 */
	public async batchTopProducts(): Promise<void> {
		const products: Product[] = await this.productModel
			.find({ productStatus: ProductStatus.ACTIVE, productRank: 0 })
			.exec();

		const promisedList = products.map(async (ele: Product) => {
			const { _id, productSales, productLikes, productComments, productViews } = ele;
			const rank = productSales * 5 + productLikes * 2 + productComments * 2 + productViews * 1;
			return await this.productModel.findByIdAndUpdate(_id, { productRank: rank });
		});
		await Promise.all(promisedList);
	}

	/** 3. Weighted score for sellers. */
	public async batchTopSellers(): Promise<void> {
		const sellers: Member[] = await this.memberModel
			.find({ memberType: MemberType.SELLER, memberStatus: MemberStatus.ACTIVE, memberRank: 0 })
			.exec();

		const promisedList = sellers.map(async (ele: Member) => {
			const { _id, memberProducts, memberSales, memberFollowers, memberLikes, memberViews } = ele;
			const rank =
				memberSales * 5 + memberProducts * 3 + memberFollowers * 3 + memberLikes * 2 + memberViews * 1;
			return await this.memberModel.findByIdAndUpdate(_id, { memberRank: rank });
		});
		await Promise.all(promisedList);
	}

	public getHello(): string {
		return 'Welcome to modu-batch!';
	}
}
