export interface Product {
  readonly id: string;
  readonly name: string;
}

export const products: readonly Product[] = [
  { id: 'oak-table', name: 'Oak table' },
  { id: 'oak-chair', name: 'Oak chair' },
  { id: 'pine-shelf', name: 'Pine shelf' },
];
