import type { ItemType } from "@/types/venue-designer";

// Tables
import { RoundTable } from "./RoundTable";
import { RectangularTable } from "./RectangularTable";
import { CocktailTable } from "./CocktailTable";
import { SweetheartTable } from "./SweetheartTable";
import { GiftTable } from "./GiftTable";
import { BarCounter } from "./BarCounter";
import { BuffetTable } from "./BuffetTable";

// Seating
import { Chair } from "./Chair";
import { ChiavariChair } from "./ChiavariChair";
import { CrossbackChair } from "./CrossbackChair";
import { GhostChair } from "./GhostChair";
import { Bench } from "./Bench";
import { LoungeSofa } from "./LoungeSofa";

// Florals
import { FlowerWall } from "./FlowerWall";
import { FlowerVase } from "./FlowerVase";
import { FlowerCenterpiece } from "./FlowerCenterpiece";
import { TallArrangement } from "./TallArrangement";
import { Arch } from "./Arch";
import { Garland } from "./Garland";
import { Wreath } from "./Wreath";
import { Topiary } from "./Topiary";
import { PetalScatter } from "./PetalScatter";
import { PottedPlant } from "./PottedPlant";

// Lighting
import { Candelabra } from "./Candelabra";
import { CandleCluster } from "./CandleCluster";
import { Lantern } from "./Lantern";
import { FloorUplight } from "./FloorUplight";

// Decor
import { BackdropPanel } from "./BackdropPanel";
import { MirrorPanel } from "./MirrorPanel";
import { AisleRunner } from "./AisleRunner";
import { BalloonArch } from "./BalloonArch";
import { BalloonColumn } from "./BalloonColumn";
import { WelcomeSign } from "./WelcomeSign";
import { CakeStand } from "./CakeStand";
import { PhotoFrame } from "./PhotoFrame";
import { NeonSign } from "./NeonSign";
import { FabricDrape } from "./FabricDrape";
import { DessertTable } from "./DessertTable";
import { DJBooth } from "./DJBooth";

// Structure
import { Stage } from "./Stage";
import { ColumnPillar } from "./ColumnPillar";
import { Pergola } from "./Pergola";
import { DanceFloor } from "./DanceFloor";

export const ITEM_COMPONENTS: Record<
  ItemType,
  React.ComponentType<{ color?: string; variant?: string }>
> = {
  // Tables
  round_table: RoundTable,
  rectangular_table: RectangularTable,
  cocktail_table: CocktailTable,
  sweetheart_table: SweetheartTable,
  gift_table: GiftTable,
  bar_counter: BarCounter,
  buffet_table: BuffetTable,

  // Seating
  chair: Chair,
  chiavari_chair: ChiavariChair,
  crossback_chair: CrossbackChair,
  ghost_chair: GhostChair,
  bench: Bench,
  lounge_sofa: LoungeSofa,

  // Florals
  flower_wall: FlowerWall,
  flower_vase: FlowerVase,
  flower_centerpiece: FlowerCenterpiece,
  tall_arrangement: TallArrangement,
  arch: Arch,
  garland: Garland,
  wreath: Wreath,
  topiary: Topiary,
  petal_scatter: PetalScatter,
  potted_plant: PottedPlant,

  // Lighting
  candelabra: Candelabra,
  candle_cluster: CandleCluster,
  lantern: Lantern,
  floor_uplight: FloorUplight,

  // Decor
  backdrop_panel: BackdropPanel,
  mirror_panel: MirrorPanel,
  aisle_runner: AisleRunner,
  balloon_arch: BalloonArch,
  balloon_column: BalloonColumn,
  welcome_sign: WelcomeSign,
  cake_stand: CakeStand,
  photo_frame: PhotoFrame,
  neon_sign: NeonSign,
  fabric_drape: FabricDrape,
  dessert_table: DessertTable,
  dj_booth: DJBooth,

  // Structure
  stage: Stage,
  column_pillar: ColumnPillar,
  pergola: Pergola,
  dance_floor: DanceFloor,
};
