import type { ItemType } from "@/types/venue-designer";
import { RoundTable } from "./RoundTable";
import { RectangularTable } from "./RectangularTable";
import { Chair } from "./Chair";
import { FlowerVase } from "./FlowerVase";
import { FlowerCenterpiece } from "./FlowerCenterpiece";
import { TallArrangement } from "./TallArrangement";
import { Arch } from "./Arch";
import { Candelabra } from "./Candelabra";
import { CandleCluster } from "./CandleCluster";
import { Lantern } from "./Lantern";
import { FairyLights } from "./FairyLights";
import { BackdropPanel } from "./BackdropPanel";
import { MirrorPanel } from "./MirrorPanel";
import { Garland } from "./Garland";
import { AisleRunner } from "./AisleRunner";
import { Stage } from "./Stage";

export const ITEM_COMPONENTS: Record<
  ItemType,
  React.ComponentType<{ color?: string; variant?: string }>
> = {
  round_table: RoundTable,
  rectangular_table: RectangularTable,
  chair: Chair,
  flower_vase: FlowerVase,
  flower_centerpiece: FlowerCenterpiece,
  tall_arrangement: TallArrangement,
  arch: Arch,
  candelabra: Candelabra,
  candle_cluster: CandleCluster,
  lantern: Lantern,
  fairy_lights: FairyLights,
  backdrop_panel: BackdropPanel,
  mirror_panel: MirrorPanel,
  garland: Garland,
  aisle_runner: AisleRunner,
  stage: Stage,
};
