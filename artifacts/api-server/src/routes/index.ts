import { Router, type IRouter } from "express";
import healthRouter from "./health";
import articlesRouter from "./articles";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(articlesRouter);
router.use(settingsRouter);

export default router;
