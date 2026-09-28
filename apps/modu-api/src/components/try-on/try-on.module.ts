import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ProductSchema from '../../schemas/Product.model';
import { TryOnResolver } from './try-on.resolver';
import { TryOnService } from './try-on.service';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Product', schema: ProductSchema }]),
		AuthModule, // the resolver uses guards
	],
	providers: [TryOnResolver, TryOnService],
})
export class TryOnModule {}
