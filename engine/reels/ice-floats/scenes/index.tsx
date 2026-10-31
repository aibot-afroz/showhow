import type React from "react";
import type { SceneMap } from "../../../src/engine/Stage";
import { IceWorld } from "./IceWorld";

// Every scene draws the same world from the reel's frame, so each handover is one continuous picture.
const World: React.FC = () => <IceWorld />;

export const scenes: SceneMap = { hook: World, liquid: World, rings: World, room: World, lake: World };
