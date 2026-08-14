import {
	InteractiveSlider,
	type InteractiveSliderProps,
} from "../components/ui/slider-primitive";

export default function SliderIsland(props: InteractiveSliderProps) {
	return <InteractiveSlider {...props} />;
}

export type { InteractiveSliderProps as SliderIslandProps };
