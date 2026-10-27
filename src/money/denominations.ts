// Physical banknote data, in meters. Banxico G series.
export interface Denomination {
  value: number; // MXN
  length: number; // along X when lying flat
  width: number; // along Z
  thickness: number; // along Y
  color: number;
}

export const DENOMINATIONS = {
  500: { value: 500, length: 0.148, width: 0.065, thickness: 0.0001, color: 0x4a7fc1 },
} satisfies Record<number, Denomination>;

export const DEFAULT_BILL: Denomination = DENOMINATIONS[500];
