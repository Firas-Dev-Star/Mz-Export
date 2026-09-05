/**
 * Declarations de types pour seed-data.cjs.
 *
 * Le module est en CommonJS pour etre `require`-able depuis le processus
 * principal Electron ; ces declarations lui rendent son typage cote TypeScript.
 */

export interface SeedCurrency {
  code: string
  name: string
  symbol: string
  decimals: number
}

export interface SeedSequence {
  key: string
  label: string
  prefix: string
  suffix: string
  padding: number
  nextNumber: number
  resetYearly: boolean
  includeYear: boolean
}

export interface SeedAdmin {
  email: string
  password: string
  name: string
  role: string
}

export declare const CURRENCIES: SeedCurrency[]
export declare const COMPANY: Record<string, string> & { id: string }
export declare const SEQUENCES: SeedSequence[]
export declare function adminAccount(env?: NodeJS.ProcessEnv): SeedAdmin
