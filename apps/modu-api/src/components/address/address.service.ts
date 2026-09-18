import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { Address } from '../../libs/dto/address/address';
import { AddressInput } from '../../libs/dto/address/address.input';
import { AddressUpdate } from '../../libs/dto/address/address.update';
import { Message } from '../../libs/enums/common.enum';

@Injectable()
export class AddressService {
	constructor(@InjectModel('Address') private readonly addressModel: Model<Address>) {}

	/** default first, then most recently used */
	public async getMyAddresses(memberId: ObjectId): Promise<Address[]> {
		return await this.addressModel
			.find({ memberId })
			.sort({ isDefault: -1, updatedAt: -1 })
			.lean<Address[]>()
			.exec();
	}

	public async createAddress(input: AddressInput): Promise<Address> {
		// the first address a member saves becomes the default on its own
		const count = await this.addressModel.countDocuments({ memberId: input.memberId }).exec();
		const isDefault = count === 0 || !!input.isDefault;
		if (isDefault) await this.clearDefault(input.memberId as ObjectId);

		return await this.addressModel.create({ ...input, isDefault });
	}

	public async updateAddress(memberId: ObjectId, input: AddressUpdate): Promise<Address> {
		if (input.isDefault) await this.clearDefault(memberId);
		const result = await this.addressModel
			.findOneAndUpdate({ _id: input._id, memberId }, input, { new: true })
			.exec();
		if (!result) throw new NotFoundException(Message.UPDATE_FAILED);
		return result;
	}

	public async removeAddress(memberId: ObjectId, addressId: ObjectId): Promise<Address> {
		const result = await this.addressModel.findOneAndDelete({ _id: addressId, memberId }).exec();
		if (!result) throw new NotFoundException(Message.REMOVE_FAILED);

		// never leave a member with addresses but no default
		if (result.isDefault) {
			const next = await this.addressModel.findOne({ memberId }).sort({ updatedAt: -1 }).exec();
			if (next) await this.addressModel.updateOne({ _id: next._id }, { isDefault: true }).exec();
		}
		return result;
	}

	/** for checkout — the address must belong to the buyer */
	public async readOwned(memberId: ObjectId, addressId: ObjectId): Promise<Address> {
		const result = await this.addressModel.findOne({ _id: addressId, memberId }).lean<Address>().exec();
		if (!result) throw new NotFoundException(Message.ADDRESS_REQUIRED);
		return result;
	}

	private async clearDefault(memberId: ObjectId): Promise<void> {
		await this.addressModel.updateMany({ memberId, isDefault: true }, { isDefault: false }).exec();
	}
}
