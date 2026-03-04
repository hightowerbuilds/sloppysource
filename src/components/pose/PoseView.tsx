import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import "./PoseView.css";

interface PoseViewProps {
  children: ReactNode;
  baseIndex?: number;
  tiltX?: number;
  tiltY?: number;
}

const DEFAULT_POSE_BASE_INDEX = 1;
const DEFAULT_POSE_TILT_X = 17;
const DEFAULT_POSE_TILT_Y = 0;

export function PoseView({
  children,
  baseIndex = DEFAULT_POSE_BASE_INDEX,
  tiltX = DEFAULT_POSE_TILT_X,
  tiltY = DEFAULT_POSE_TILT_Y,
}: PoseViewProps) {
  const elementIndex = baseIndex + 1;
  const elementsRef = useRef<HTMLDivElement | null>(null);
  const nodeYawStep = Math.max(-1.2, Math.min(1.2, tiltY * 0.044));

  const poseLayerStyles = {
    "--pose-outer-index": String(baseIndex),
    "--pose-element-index": String(elementIndex),
    "--pose-tilt-x": `${tiltX}deg`,
    "--pose-tilt-y": `${tiltY}deg`,
    "--pose-node-y-step": `${nodeYawStep}deg`,
  } as CSSProperties;

  useEffect(() => {
    const container = elementsRef.current;
    if (!container) return;

    const nodes = container.querySelectorAll<HTMLElement>("[data-pose-node]");

    nodes.forEach((node, index) => {
      node.style.setProperty("--pose-depth-index", String(index + 1));
    });
  }, [children]);

  return (
    <div className="pose-view" style={poseLayerStyles}>
      <div className="pose-view-stage is-exploded">
        <div className="pose-view-page">
          <div className="pose-view-elements" ref={elementsRef}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
