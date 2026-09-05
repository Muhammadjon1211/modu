import { registerEnumType } from '@nestjs/graphql';

export enum ProductStatus {
	ACTIVE = 'ACTIVE',
	SOLD_OUT = 'SOLD_OUT',
	DELETE = 'DELETE',
}
registerEnumType(ProductStatus, { name: 'ProductStatus' });

/** The two top-level catalog tabs. Derived from the category — never picked directly. */
export enum ProductGroup {
	CLOTHES = 'CLOTHES',
	ACCESSORIES = 'ACCESSORIES',
}
registerEnumType(ProductGroup, { name: 'ProductGroup' });

export enum ProductCategory {
	/** group: CLOTHES */
	TOP = 'TOP',
	BOTTOM = 'BOTTOM',
	OUTERWEAR = 'OUTERWEAR',
	DRESS = 'DRESS',
	ACTIVEWEAR = 'ACTIVEWEAR',
	UNDERWEAR = 'UNDERWEAR',
	SHOES = 'SHOES',
	/** group: ACCESSORIES */
	BAG = 'BAG',
	HAT = 'HAT',
	BELT = 'BELT',
	JEWELRY = 'JEWELRY',
	SCARF = 'SCARF',
	SUNGLASSES = 'SUNGLASSES',
	OTHER_ACCESSORY = 'OTHER_ACCESSORY',
}
registerEnumType(ProductCategory, { name: 'ProductCategory' });

export enum ProductGender {
	MEN = 'MEN',
	WOMEN = 'WOMEN',
	UNISEX = 'UNISEX',
	KIDS = 'KIDS',
}
registerEnumType(ProductGender, { name: 'ProductGender' });

export enum ProductSize {
	XS = 'XS',
	S = 'S',
	M = 'M',
	L = 'L',
	XL = 'XL',
	XXL = 'XXL',
	FREE = 'FREE',
}
registerEnumType(ProductSize, { name: 'ProductSize' });

export enum ProductColor {
	BLACK = 'BLACK',
	WHITE = 'WHITE',
	GREY = 'GREY',
	BEIGE = 'BEIGE',
	BROWN = 'BROWN',
	RED = 'RED',
	PINK = 'PINK',
	ORANGE = 'ORANGE',
	YELLOW = 'YELLOW',
	GREEN = 'GREEN',
	BLUE = 'BLUE',
	NAVY = 'NAVY',
	PURPLE = 'PURPLE',
	MULTI = 'MULTI',
}
registerEnumType(ProductColor, { name: 'ProductColor' });

export enum ProductSeason {
	SPRING = 'SPRING',
	SUMMER = 'SUMMER',
	AUTUMN = 'AUTUMN',
	WINTER = 'WINTER',
	ALL_SEASON = 'ALL_SEASON',
}
registerEnumType(ProductSeason, { name: 'ProductSeason' });

export enum ProductFit {
	SLIM = 'SLIM',
	REGULAR = 'REGULAR',
	OVERSIZE = 'OVERSIZE',
}
registerEnumType(ProductFit, { name: 'ProductFit' });
