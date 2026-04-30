import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React from "react";

import { useScratchPlanStore } from "../../../stores/scratchPlanStore";

import ActivityCard from "./ActivityCard";
import FoodSlot from "./FoodSlot";

import type {
  ActivityStop,
  CuratedDay,
  MealSlot,
  RestaurantOption,
} from "../../../types/scratchPlan";
import type { DragEndEvent } from "@dnd-kit/core";

interface Props {
  curatedDay: CuratedDay;
  dayIndex: number;
  isOpen: boolean;
  onToggle: () => void;
}

export default function DayAccordion({
  curatedDay,
  dayIndex,
  isOpen,
  onToggle,
}: Props): React.ReactElement {
  const removeActivityStop = useScratchPlanStore((s) => s.removeActivityStop);
  const reorderActivityStops = useScratchPlanStore((s) => s.reorderActivityStops);
  const chooseFoodOption = useScratchPlanStore((s) => s.chooseFoodOption);
  const skipFoodSlot = useScratchPlanStore((s) => s.skipFoodSlot);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const stops = curatedDay.activityStops;
    const fromIndex = stops.findIndex((s) => s.place_id === active.id || s.name === active.id);
    const toIndex = stops.findIndex((s) => s.place_id === over.id || s.name === over.id);

    if (fromIndex !== -1 && toIndex !== -1) {
      reorderActivityStops(dayIndex, fromIndex, toIndex);
    }
  }

  const activityCount = curatedDay.activityStops.length;
  const foodCount = curatedDay.foodChoices.filter((fc) => fc.chosen !== null).length;
  const stopIds = curatedDay.activityStops.map((s) => s.place_id ?? s.name);

  return (
    <div className={`day-accordion ${isOpen ? "open" : ""}`}>
      {/* Accordion header */}
      <button className="day-header" onClick={onToggle} aria-expanded={isOpen}>
        <div className="day-header-left">
          <span className="day-badge">Day {curatedDay.day}</span>
          <span className="day-summary">
            {activityCount} stop{activityCount !== 1 ? "s" : ""}
            {foodCount > 0 && ` · ${foodCount} meal${foodCount !== 1 ? "s" : ""}`}
          </span>
        </div>
        <span className="day-chevron">{isOpen ? "▲" : "▼"}</span>
      </button>

      {/* Accordion body */}
      {isOpen && (
        <div className="day-body">
          {activityCount === 0 && (
            <p className="day-empty">All stops removed. Add them back by regenerating.</p>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={stopIds} strategy={verticalListSortingStrategy}>
              {curatedDay.activityStops.map((stop, stopIndex) => (
                <SortableActivityCard
                  key={stop.place_id ?? stop.name}
                  id={stop.place_id ?? stop.name}
                  stop={stop}
                  stopIndex={stopIndex}
                  dayIndex={dayIndex}
                  onRemove={() => removeActivityStop(dayIndex, stopIndex)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Food slots */}
          {curatedDay.foodSlots.map((slot) => {
            const choice = curatedDay.foodChoices.find((fc) => fc.meal === slot.meal);
            return (
              <FoodSlot
                key={slot.meal}
                slot={slot}
                choice={choice}
                dayIndex={dayIndex}
                onChoose={(meal: MealSlot, option: RestaurantOption) =>
                  chooseFoodOption(dayIndex, meal, option)
                }
                onSkip={(meal: MealSlot) => skipFoodSlot(dayIndex, meal)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sortable wrapper for ActivityCard ───────────────────────────────────────

function SortableActivityCard({
  id,
  stop,
  stopIndex,
  dayIndex,
  onRemove,
}: {
  id: string;
  stop: ActivityStop;
  stopIndex: number;
  dayIndex: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ActivityCard
        stop={stop}
        index={stopIndex}
        dayIndex={dayIndex}
        onRemove={onRemove}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </div>
  );
}
