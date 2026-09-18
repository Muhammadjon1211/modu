import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { AddressService } from './address.service';
import { Address } from '../../libs/dto/address/address';
import { AddressInput } from '../../libs/dto/address/address.input';
import { AddressUpdate } from '../../libs/dto/address/address.update';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { shapeIntoMongoObjectId } from '../../libs/config';

@Resolver()
export class AddressResolver {
	constructor(private readonly addressService: AddressService) {}

	@UseGuards(AuthGuard)
	@Query(() => [Address])
	public async getMyAddresses(@AuthMember('_id') memberId: ObjectId): Promise<Address[]> {
		console.log('Query: getMyAddresses');
		return await this.addressService.getMyAddresses(memberId);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Address)
	public async createAddress(
		@Args('input') input: AddressInput,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Address> {
		console.log('Mutation: createAddress');
		input.memberId = memberId;
		return await this.addressService.createAddress(input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Address)
	public async updateAddress(
		@Args('input') input: AddressUpdate,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Address> {
		console.log('Mutation: updateAddress');
		input._id = shapeIntoMongoObjectId(input._id);
		return await this.addressService.updateAddress(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Address)
	public async removeAddress(
		@Args('addressId') input: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Address> {
		console.log('Mutation: removeAddress');
		return await this.addressService.removeAddress(memberId, shapeIntoMongoObjectId(input));
	}
}
