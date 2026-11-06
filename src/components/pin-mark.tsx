import { SvgXml } from 'react-native-svg';

import { pinSvg } from '@/constants/brand';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  size: number;
  /** Defaults to the theme's Cobalt pin with a background-coloured #. */
  pin?: string;
  hash?: string;
};

/** The Stashtag pin mark (concept B). Also intended for in-app map pins. */
export function PinMark({ size, pin, hash }: Props) {
  const theme = useTheme();
  return <SvgXml xml={pinSvg({ pin: pin ?? theme.tint, hash: hash ?? theme.background })} width={size} height={size} />;
}
