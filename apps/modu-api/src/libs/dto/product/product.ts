import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import {
	ProductCategory,
	ProductColor,
	ProductFit,
	ProductGender,
	ProductGroup,
	ProductSeason,
	ProductSize,
	ProductStatus,
} from '../../enums/product.enum';
import { Member, TotalCounter } from '../member/member';
import { MeLiked } from '../like/like';

@ObjectType()
export class Product {
	@Field(() => String) _id: ObjectId;

	@Field(() => ProductCategory) productCategory: ProductCategory;

	@Field(() => ProductGroup) productGroup: ProductGroup;

	@Field(() => ProductStatus) productStatus: ProductStatus;

	@Field(() => ProductGender) productGender: ProductGender;

	@Field(() => String) productBrand: string;

	@Field(() => String) productTitle: string;

	@Field(() => Float) productPrice: number;

	@Field(() => Int) productDiscount: number;

	@Field(() => Int) productStock: number;

	@Field(() => [ProductSize]) productSizes: ProductSize[];

	@Field(() => [ProductColor]) productColors: ProductColor[];

	@Field(() => [ProductSeason], { nullable: true }) productSeasons?: ProductSeason[];

	@Field(() => ProductFit, { nullable: true }) productFit?: ProductFit;

	@Field(() => [String]) productImages: string[];

	@Field(() => String, { nullable: true }) productDesc?: string;

	@Field(() => String, { nullable: true }) productMaterial?: string;

	@Field(() => [String], { nullable: true }) productTags?: string[];

	@Field(() => Boolean) productOnSale: boolean;

	@Field(() => Boolean) productFreeShipping: boolean;

	@Field(() => Int) productViews: number;

	@Field(() => Int) productLikes: number;

	@Field(() => Int) productComments: number;

	@Field(() => Int) productSales: number;

	@Field(() => Float) productRating: number;

	@Field(() => Int) productRatingCount: number;

	@Field(() => Int) productRank: number;

	@Field(() => String) memberId: ObjectId;

	@Field(() => Date, { nullable: true }) soldOutAt?: Date;

	@Field(() => Date, { nullable: true }) deletedAt?: Date;

	@Field(() => Date) createdAt: Date;

	@Field(() => Date) updatedAt: Date;

	/** from aggregation **/
	@Field(() => Member, { nullable: true }) memberData?: Member;

	@Field(() => [MeLiked], { nullable: true }) meLiked?: MeLiked[];
}

@ObjectType()
export class Products {
	@Field(() => [Product]) list: Product[];

	@Field(() => [TotalCounter], { nullable: true }) metaCounter: TotalCounter[];
}
