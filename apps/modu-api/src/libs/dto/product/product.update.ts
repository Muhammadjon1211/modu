import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsNotEmpty, IsOptional, Length, Max, Min } from 'class-validator';
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

@InputType()
export class ProductUpdate {
	@IsNotEmpty()
	@Field(() => String)
	_id: ObjectId;

	@IsOptional()
	@Field(() => ProductStatus, { nullable: true })
	productStatus?: ProductStatus;

	@IsOptional()
	@Field(() => ProductCategory, { nullable: true })
	productCategory?: ProductCategory;

	@IsOptional()
	@Field(() => ProductGender, { nullable: true })
	productGender?: ProductGender;

	@IsOptional()
	@Length(2, 60)
	@Field(() => String, { nullable: true })
	productBrand?: string;

	@IsOptional()
	@Length(3, 100)
	@Field(() => String, { nullable: true })
	productTitle?: string;

	@IsOptional()
	@Min(0)
	@Field(() => Float, { nullable: true })
	productPrice?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(99)
	@Field(() => Int, { nullable: true })
	productDiscount?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Field(() => Int, { nullable: true })
	productStock?: number;

	@IsOptional()
	@Field(() => [ProductSize], { nullable: true })
	productSizes?: ProductSize[];

	@IsOptional()
	@Field(() => [ProductColor], { nullable: true })
	productColors?: ProductColor[];

	@IsOptional()
	@Field(() => [ProductSeason], { nullable: true })
	productSeasons?: ProductSeason[];

	@IsOptional()
	@Field(() => ProductFit, { nullable: true })
	productFit?: ProductFit;

	@IsOptional()
	@Field(() => [String], { nullable: true })
	productImages?: string[];

	@IsOptional()
	@Length(5, 5000)
	@Field(() => String, { nullable: true })
	productDesc?: string;

	@IsOptional()
	@Field(() => String, { nullable: true })
	productMaterial?: string;

	@IsOptional()
	@Field(() => [String], { nullable: true })
	productTags?: string[];

	@IsOptional()
	@Field(() => Boolean, { nullable: true })
	productFreeShipping?: boolean;

	/** re-derived server-side when the category or the discount changes */
	productGroup?: ProductGroup;
	productOnSale?: boolean;

	soldOutAt?: Date; // server-set only
	deletedAt?: Date; // server-set only
}
