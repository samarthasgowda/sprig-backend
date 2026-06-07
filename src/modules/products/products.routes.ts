import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { listProductsSchema } from './products.schema';
import * as c from './products.controller';

const router = Router();
router.get('/', validate(listProductsSchema, 'query'), c.listCtrl);
router.get('/:id', c.getCtrl);
export default router;
