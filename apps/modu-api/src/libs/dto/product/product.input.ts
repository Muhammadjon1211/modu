import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsInt, IsNotEmpty, IsOptional, Length, Max, Min } from 'class-validator';
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
import { Direction } from '../../enums/common.enum';
import { availableOptions, availableProductSorts } from '../../config';

@InputType()
export class ProductInput {
	@IsNotEmpty()
	@Field(() => ProductCategory)
	productCategory: ProductCategory;

	@IsNotEmpty()
	@Field(() => ProductGender)
	productGender: ProductGender;

	@IsNotEmpty()
	@Length(2, 60)
	@Field(() => String)
	productBrand: string;

	@IsNotEmpty()
	@Length(3, 100)
	@Field(() => String)
	productTitle: string;

	@IsNotEmpty()
	@Min(0)
	@Field(() => Float)
	productPrice: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(99)
	@Field(() => Int, { nullable: true })
	productDiscount?: number;

	@IsNotEmpty()
	@IsInt()
	@Min(0)
	@Field(() => Int)
	productStock: number;

	@IsNotEmpty()
	@Field(() => [ProductSize])
	productSizes: ProductSize[];

	@IsNotEmpty()
	@Field(() => [ProductColor])
	productColors: ProductColor[];

	@IsOptional()
	@Field(() => [ProductSeason], { nullable: true })
	productSeasons?: ProductSeason[];

	@IsOptional()
	@Field(() => ProductFit, { nullable: true })
	productFit?: ProductFit;

	@IsNotEmpty()
	@Field(() => [String])
	productImages: string[];

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

	/** derived server-side from the category — the client can never mis-tab a product */
	productGroup?: ProductGroup;

	/** derived server-side from productDiscount */
	productOnSale?: boolean;

	/** assigned in the resolver from @AuthMember('_id') */
	memberId?: ObjectId;
}

@InputType()
export class PricesRange {
	@Field(() => Float) start: number;

	@Field(() => Float) end: number;
}

@InputType()
export class PeriodsRange {
	@Field(() => Date) start: Date;

	@Field(() => Date) end: Date;
}

@InputType()
class PISearch {
	@IsOptional()
	@Field(() => String, { nullable: true })
	memberId?: ObjectId;

	@IsOptional()
	@Field(() => ProductGroup, { nullable: true })
	group?: ProductGroup;

	@IsOptional()
	@Field(() => [ProductCategory], { nullable: true })
	categoryList?: ProductCategory[];

	@IsOptional()
	@Field(() => [ProductSize], { nullable: true })
	sizeList?: ProductSize[];

	@IsOptional()
	@Field(() => [ProductColor], { nullable: true })
	colorList?: ProductColor[];

	@IsOptional()
	@Field(() => [ProductGender], { nullable: true })
	genderList?: ProductGender[];

	@IsOptional()
	@Field(() => [ProductSeason], { nullable: true })
	seasonList?: ProductSeason[];

	@IsOptional()
	@Field(() => [ProductFit], { nullable: true })
	fitList?: ProductFit[];

	@IsOptional()
	@IsIn(availableOptions, { each: true })
	@Field(() => [String], { nullable: true })
	options?: string[];

	@IsOptional()
	@Field(() => PricesRange, { nullable: true })
	pricesRange?: PricesRange;

	@IsOptional()
	@Field(() => PeriodsRange, { nullable: true })
	periodsRange?: PeriodsRange;

	@IsOptional()
	@Min(1)
	@Max(5)
	@Field(() => Int, { nullable: true })
	ratingFrom?: number;

	@IsOptional()
	@Field(() => Boolean, { nullable: true })
	inStockOnly?: boolean;

	@IsOptional()
	@Field(() => String, { nullable: true })
	text?: string;
}

@InputType()
export class ProductsInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableProductSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => PISearch)
	search: PISearch;
}

@InputType()
class SPISearch {
	@IsOptional()
	@Field(() => ProductStatus, { nullable: true })
	productStatus?: ProductStatus;

	@IsOptional()
	@Field(() => [ProductCategory], { nullable: true })
	categoryList?: ProductCategory[];

	@IsOptional()
	@Field(() => String, { nullable: true })
	text?: string;
}

/** the seller's own product list */
@InputType()
export class SellerProductsInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableProductSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => SPISearch)
	search: SPISearch;
}

@InputType()
class ALPISearch {
	@IsOptional()
	@Field(() => ProductStatus, { nullable: true })
	productStatus?: ProductStatus;

	@IsOptional()
	@Field(() => [ProductCategory], { nullable: true })
	categoryList?: ProductCategory[];

	@IsOptional()
	@Field(() => String, { nullable: true })
	text?: string;
}

@InputType()
export class AllProductsInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableProductSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => ALPISearch)
	search: ALPISearch;
}
