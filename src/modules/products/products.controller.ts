import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as svc from './products.service';

export const listCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.listProducts(req.query as never));
});
export const getCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.getProduct(req.params.id));
});
