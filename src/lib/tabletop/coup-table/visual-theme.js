import duquePortrait from '../../../../assets/characters/duque.webp';
import assassinaPortrait from '../../../../assets/characters/assassina.webp';
import capitaoPortrait from '../../../../assets/characters/capitao.webp';
import embaixadoraPortrait from '../../../../assets/characters/embaixadora.webp';
import condessaPortrait from '../../../../assets/characters/condessa.webp';
import incomeArt from '../../../../assets/actions/income.webp';
import foreignAidArt from '../../../../assets/actions/foreign-aid.webp';
import taxArt from '../../../../assets/actions/tax.webp';
import stealArt from '../../../../assets/actions/steal.webp';
import exchangeArt from '../../../../assets/actions/exchange.webp';
import assassinateArt from '../../../../assets/actions/assassinate.webp';
import coupArt from '../../../../assets/actions/coup.webp';

export const ROBES = [0x52252c, 0x1e3a45, 0x3e3821, 0x352547, 0x23372b, 0x473221];

export const ROLE_COLORS = {
  Duque: '#b69255',
  Assassina: '#8f2930',
  Capitão: '#286b7d',
  Embaixadora: '#34765f',
  Condessa: '#7a3044',
};

export const ROLE_CARD_ACCENTS = {
  Duque: '#e0bc74',
  Assassina: '#dc6670',
  Capitão: '#71c2d3',
  Embaixadora: '#69bd9a',
  Condessa: '#c9758e',
};

export const ROLE_PORTRAITS = {
  Duque: duquePortrait,
  Assassina: assassinaPortrait,
  Capitão: capitaoPortrait,
  Embaixadora: embaixadoraPortrait,
  Condessa: condessaPortrait,
};

export const ACTION_ART = {
  income: incomeArt,
  foreign_aid: foreignAidArt,
  tax: taxArt,
  steal: stealArt,
  exchange: exchangeArt,
  assassinate: assassinateArt,
  coup: coupArt,
};

export const THEME_PROFILES = {
  dark: {
    clearColor: 0x171411,
    fogColor: 0x211b17,
    fogDensity: 0.018,
    exposure: 1.36,
    grain: 0.015,
    vignette: 0.38,
  },
  light: {
    clearColor: 0xb8a78e,
    fogColor: 0xc9b99f,
    fogDensity: 0.018,
    exposure: 1.12,
    grain: 0.008,
    vignette: 0.34,
  },
};
