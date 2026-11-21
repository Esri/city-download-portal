import "@esri/calcite-components/dist/components/calcite-label";
import "@esri/calcite-components/dist/components/calcite-segmented-control";
import "@esri/calcite-components/dist/components/calcite-segmented-control-item";
import { CalciteLabel, CalciteSegmentedControl, CalciteSegmentedControlItem } from "@esri/calcite-components-react";
import { useId } from "react";
import { useAccessorValue } from "~/arcgis/reactive-hooks";
import { useSelectionState } from "../selection/selection-store";

export default function FootprintControl({ disabled = false }: { disabled?: boolean }) {
  const store = useSelectionState();
  const shape = useAccessorValue(() => store.footprintShape);
  const name = useId();

  return (
    <CalciteLabel scale="s" onClick={event => event.stopPropagation()}>
      <p className="font-medium">Footprint</p>
      <CalciteSegmentedControl
        scale="s"
        name={name}
        aria-label="Footprint"
        disabled={disabled}
        onCalciteSegmentedControlChange={event => {
          store.footprintShape = event.target.value === "hexagon" ? "hexagon" : "rectangle";
        }}
      >
        <CalciteSegmentedControlItem value="rectangle" checked={shape === "rectangle"}>Rectangle</CalciteSegmentedControlItem>
        <CalciteSegmentedControlItem value="hexagon" checked={shape === "hexagon"}>Hexagon</CalciteSegmentedControlItem>
      </CalciteSegmentedControl>
    </CalciteLabel>
  );
}
