import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { FileUpload, GraphQLUpload } from 'graphql-upload';
import { TryOnService } from './try-on.service';
import { Product } from '../../libs/dto/product/product';
import { TryOnResult } from '../../libs/dto/try-on/try-on';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { shapeIntoMongoObjectId } from '../../libs/config';

@Resolver(() => Product)
export class TryOnResolver {
	constructor(private readonly tryOnService: TryOnService) {}

	/** members only — every run spends the shared free GPU quota */
	@UseGuards(AuthGuard)
	@Mutation(() => TryOnResult)
	public async tryOnProduct(
		@Args('productId') input: string,
		@Args({ name: 'file', type: () => GraphQLUpload }) file: Promise<FileUpload> | FileUpload,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<TryOnResult> {
		console.log('Mutation: tryOnProduct');
		const productId = shapeIntoMongoObjectId(input);
		return await this.tryOnService.tryOn(memberId, productId, await file);
	}

	/** whether the product page shows the try-on button */
	@ResolveField(() => Boolean)
	public productTryOn(@Parent() product: Product): boolean {
		return this.tryOnService.isTryOnCategory(product.productCategory);
	}
}
