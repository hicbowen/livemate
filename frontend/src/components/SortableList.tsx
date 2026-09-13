import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({
  id,
  activeId,
  renderItem,
}: {
  id: string;
  activeId: string | null;
  renderItem: (
    id: string,
    dragHandleProps: {
      ref: React.Ref<any>;
      listeners: any;
      attributes: any;
    }
  ) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: id === activeId ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {renderItem(id, {
        ref: setActivatorNodeRef,
        listeners,
        attributes,
      })}
    </div>
  );
}

export function SortableList({
  items,
  onChange,
  renderItem,
}: {
  items: string[];
  onChange: (newItems: string[]) => void;
  renderItem: (
    id: string,
    dragHandleProps: {
      ref: React.Ref<any>;
      listeners: any;
      attributes: any;
    }
  ) => React.ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = ({ active, over }: any) => {
    if (over && active.id !== over.id) {
      const newItems = arrayMove(
        items,
        items.indexOf(active.id),
        items.indexOf(over.id)
      );
      onChange(newItems);
    }
    setActiveId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => setActiveId(active.id.toString())}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {items.map((id) => (
          <SortableItem
            key={id}
            id={id}
            activeId={activeId}
            renderItem={renderItem}
          />
        ))}
      </SortableContext>
      <DragOverlay>
        {activeId && renderItem(activeId, { ref: () => {}, attributes: {}, listeners: {} })}
      </DragOverlay>
    </DndContext>
  );
}
