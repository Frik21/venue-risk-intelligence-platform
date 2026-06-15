import { Router, type IRouter } from "express";
import healthRouter from "./health";
import assessmentsRouter from "./assessments";
import risksRouter from "./risks";
import venuesRouter from "./venues";
import incidentsRouter from "./incidents";
import evidenceRouter from "./evidence";
import alertsRouter from "./alerts";
import osintRouter from "./osint";
import riskMatrixRouter from "./risk-matrix";
import dashboardRouter from "./dashboard";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(usersRouter);
router.use(venuesRouter);
router.use(assessmentsRouter);
router.use(risksRouter);
router.use(riskMatrixRouter);
router.use(evidenceRouter);
router.use(alertsRouter);
router.use(osintRouter);
router.use(incidentsRouter);

export default router;
