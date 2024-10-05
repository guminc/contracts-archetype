export type IArchetypeErc721aConfig = {
  baseUri: string;
  affiliateSigner: string;
  maxSupply: number;
  maxBatchSize: number;
  affiliateFee: number;
  defaultRoyalty: number;
  discounts: {
    affiliateDiscount: number;
    mintTiers: {
      numMints: number;
      mintDiscount: number;
    }[];
  };
};

export type IArchetypeErc1155RandomConfig = {
  baseUri: string;
  affiliateSigner: string;
  fulfillmentSigner: string;
  maxSupply: number;
  maxBatchSize: number;
  affiliateFee: number;
  defaultRoyalty: number;
  discounts: {
    affiliateDiscount: number;
    mintTiers: {
      numMints: number;
      mintDiscount: number;
    }[];
  };
  tokenPool: number[];
};

export type IArchetypePayoutConfig = {
  ownerBps: number;
  platformBps: number;
  partnerBps: number;
  superAffiliateBps: number;
  partner: string;
  superAffiliate: string;
  ownerAltPayout: string;
};
