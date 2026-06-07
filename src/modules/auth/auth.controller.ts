import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as svc from './auth.service';

const meta = (req: Request) => ({ ip: req.ip, ua: req.headers['user-agent'] });

export const registerCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await svc.register(req.body));
});
export const loginCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.login(req.body, meta(req)));
});
export const otpRequestCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.requestOtp(req.body.phone));
});
export const otpVerifyCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.verifyOtp(req.body, meta(req)));
});
export const refreshCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.refresh(req.body.refreshToken, meta(req)));
});
export const logoutCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.logout(req.body.refreshToken));
});
export const meCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.me(req.user!.id));
});
