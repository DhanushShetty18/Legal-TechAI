/**
 * Pages import the rate table from here.
 * The numbers themselves live in engine.ts so Node can test them without a bundler.
 */
export {
  BUYER_TYPES,
  PROPERTY_TYPES,
  STATE_OPTIONS,
  STATE_RATES,
  TRANSACTION_TYPES,
  type BuyerType,
  type PropertyType,
  type StateCode,
  type TransactionType,
} from "./engine";
