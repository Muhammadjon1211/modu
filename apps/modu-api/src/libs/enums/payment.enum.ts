import { registerEnumType } from '@nestjs/graphql';

export enum PaymentType {
	CARD = 'CARD',
	BANK = 'BANK',
}
registerEnumType(PaymentType, { name: 'PaymentType' });
