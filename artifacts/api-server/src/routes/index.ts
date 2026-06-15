import { Router, type IRouter } from "express";
import healthRouter from "./health";
import assessmentsRouter from "./assessments";
import risksRouter from "./risks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(assessmentsRouter);
router.use(risksRouter);

export default router;
