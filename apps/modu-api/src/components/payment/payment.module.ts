import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import PaymentMethodSchema from '../../schemas/PaymentMethod.model';
import { PaymentResolver } from './payment.resolver';
import { PaymentService } from './payment.service';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'PaymentMethod', schema: PaymentMethodSchema }]), AuthModule],
	providers: [PaymentResolver, PaymentService],
	exports: [PaymentService],
})
export class PaymentModule {}
