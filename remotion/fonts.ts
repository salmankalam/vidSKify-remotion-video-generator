import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import type { FontPair } from "../lib/spec";

// loadFont() registers the faces and holds Remotion's delayRender until they
// are ready, so both the Player and the renderer get the real typefaces.
const inter = loadInter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const spaceGrotesk = loadSpaceGrotesk("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });
const playfair = loadPlayfair("normal", { weights: ["400", "700"], subsets: ["latin"] });
const anton = loadAnton("normal", { weights: ["400"], subsets: ["latin"] });

export const FONT_STACKS: Record<FontPair, { display: string; body: string }> = {
  modern: { display: spaceGrotesk.fontFamily, body: inter.fontFamily },
  editorial: { display: playfair.fontFamily, body: inter.fontFamily },
  bold: { display: anton.fontFamily, body: inter.fontFamily },
};
