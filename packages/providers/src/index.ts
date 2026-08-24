import type { ProviderModule } from "./module.ts";
import type { Logger } from "./logger.ts";
import { createRegistry } from "./registry.ts";
import { createLogger, consoleSink } from "./logger.ts";

import { forcerModule } from "./providers/shopify/forcer.ts";
import { misbhvModule } from "./providers/shopify/misbhv.ts";
import { montielModule } from "./providers/shopify/montiel.ts";
import { nooMaModule } from "./providers/shopify/noo-ma.ts";
import { magdabutrymModule } from "./providers/shopify/magdabutrym.ts";
import { nagoModule } from "./providers/shopify/nago.ts";
import { godsavequeensModule } from "./providers/shopify/godsavequeens.ts";
import { theoddersideModule } from "./providers/shopify/theodderside.ts";
import { boosoModule } from "./providers/shopify/booso.ts";
import { gymglamourModule } from "./providers/shopify/gymglamour.ts";
import { hdreyModule } from "./providers/shopify/hdrey.ts";
import { wakenbakeModule } from "./providers/shopify/wakenbake.ts";
import { arustamianModule } from "./providers/shoper/arustamian.ts";
import { eDaagModule } from "./providers/shoper/e-daag.ts";
import { emereedivineModule } from "./providers/shoper/emereedivine.ts";
import { sklepskolimModule } from "./providers/shoper/sklepskolim.ts";
import { wkdzikModule } from "./providers/shoper/wkdzik.ts";
import { reverModule } from "./providers/web/rever.ts";
import { dobrerzeczyModule } from "./providers/web/dobrerzeczy.ts";
import { royalwatchModule } from "./providers/web/royalwatch.ts";
import { mushiModule } from "./providers/web/mushi.ts";
import { premieresocietyModule } from "./providers/web/premieresociety.ts";
import { foodsbyannModule } from "./providers/web/foodsbyann.ts";
import { laboratoriumpanidomuModule } from "./providers/prestashop/laboratoriumpanidomu.ts";
import { phlovModule } from "./providers/prestashop/phlov.ts";

export const ALL_MODULES: readonly ProviderModule[] = [
  forcerModule,
  misbhvModule,
  montielModule,
  nooMaModule,
  magdabutrymModule,
  nagoModule,
  godsavequeensModule,
  theoddersideModule,
  boosoModule,
  gymglamourModule,
  hdreyModule,
  wakenbakeModule,
  arustamianModule,
  eDaagModule,
  emereedivineModule,
  sklepskolimModule,
  wkdzikModule,
  reverModule,
  dobrerzeczyModule,
  royalwatchModule,
  mushiModule,
  premieresocietyModule,
  foodsbyannModule,
  laboratoriumpanidomuModule,
  phlovModule,
];

export function createDefaultRegistry() {
  return createRegistry(ALL_MODULES);
}

export type { ProviderDeps, ProviderModule, DirectFetch } from "./module.ts";
export type {
  Catalog,
  ExecutionMode,
  Money,
  Platform,
  Product,
  Provider,
  ProviderConfig,
  StockRevealTarget,
  StockRevealer,
  StockSource,
  Variant,
} from "./types.ts";
export { PROVIDERS } from "./config.ts";
export { createLogger, consoleSink } from "./logger.ts";
export type { LogContext, LogLevel, LogRecord, LogSink, Logger } from "./logger.ts";
export { assertNonEmptyString, assertPositiveInteger, isNullish, requireValue, truncateMessage } from "./helpers.ts";
export { buildProvider, buildStockRevealer, notImplemented, ProviderError } from "./factory.ts";
export { createRegistry } from "./registry.ts";
export type { ProviderRegistry } from "./registry.ts";
export { createCaptchaClient } from "./captcha/client.ts";
export type { CaptchaClient, CaptchaClientOptions, CaptchaSolution, TurnstileTask } from "./captcha/client.ts";
export { isCloudflareChallenge, findTurnstileSitekey } from "./captcha/detect.ts";
export function buildLogger(): Logger {
  return createLogger(consoleSink);
}
