import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/Button.js';
import { ColorPicker } from '../../components/ui/ColorPicker.js';
import { ItemSelect } from '../../components/ui/ItemSelect.js';
import type { ColorValue } from '../../components/ui/types.js';
import { CANVAS_FALLBACK_TILE_COLOR } from '../../constants.js';
import { getColorizedSprite } from '../colorize.js';
import { getColorizedFloorSprite, getFloorPatternCount, hasFloorSprites } from '../floorTiles.js';
import type { FurnitureCategory, LoadedAssetData } from '../layout/furnitureCatalog.js';
import {
  buildDynamicCatalog,
  getActiveCategories,
  getCatalogByCategory,
} from '../layout/furnitureCatalog.js';
import { getCachedSprite } from '../sprites/spriteCache.js';
import type { ProjectRoom, TileType as TileTypeVal, ZoneType } from '../types.js';
import { EditTool, ProjectRoomKind } from '../types.js';
import { getWallSetCount, getWallSetPreviewSprite } from '../wallTiles.js';
import type { ProjectRoomEditorPatch } from './roomEditorActions.js';

interface EditorToolbarProps {
  activeTool: EditTool;
  selectedTileType: TileTypeVal;
  selectedFurnitureType: string;
  selectedZone: ZoneType;
  selectedFurnitureUid: string | null;
  selectedProjectRoomId: string | null;
  projectRooms: ProjectRoom[];
  selectedFurnitureColor: ColorValue | null;
  floorColor: ColorValue;
  wallColor: ColorValue;
  selectedWallSet: number;
  onToolChange: (tool: EditTool) => void;
  onTileTypeChange: (type: TileTypeVal) => void;
  onFloorColorChange: (color: ColorValue) => void;
  onWallColorChange: (color: ColorValue) => void;
  onWallSetChange: (setIndex: number) => void;
  onSelectedFurnitureColorChange: (color: ColorValue | null) => void;
  onFurnitureTypeChange: (type: string) => void;
  onZoneChange: (zone: ZoneType) => void;
  onRoomSelect: (roomId: string | null) => void;
  onRoomUpdate: (patch: ProjectRoomEditorPatch) => void;
  onRoomDelete: () => void;
  onAutoCreateRooms: () => void;
  loadedAssets?: LoadedAssetData;
}

const THUMB_ZOOM = 2;

const DEFAULT_FURNITURE_COLOR: ColorValue = { h: 0, s: 0, b: 0, c: 0 };

export function EditorToolbar({
  activeTool,
  selectedTileType,
  selectedFurnitureType,
  selectedZone,
  selectedFurnitureUid,
  selectedProjectRoomId,
  projectRooms,
  selectedFurnitureColor,
  floorColor,
  wallColor,
  selectedWallSet,
  onToolChange,
  onTileTypeChange,
  onFloorColorChange,
  onWallColorChange,
  onWallSetChange,
  onSelectedFurnitureColorChange,
  onFurnitureTypeChange,
  onZoneChange,
  onRoomSelect,
  onRoomUpdate,
  onRoomDelete,
  onAutoCreateRooms,
  loadedAssets,
}: EditorToolbarProps) {
  const [activeCategory, setActiveCategory] = useState<FurnitureCategory>('desks');
  const [showColor, setShowColor] = useState(false);
  const [showWallColor, setShowWallColor] = useState(false);
  const [showFurnitureColor, setShowFurnitureColor] = useState(false);

  // Build dynamic catalog from loaded assets
  useEffect(() => {
    if (loadedAssets) {
      try {
        console.log(
          `[EditorToolbar] Building dynamic catalog with ${loadedAssets.catalog.length} assets...`,
        );
        const success = buildDynamicCatalog(loadedAssets);
        console.log(`[EditorToolbar] Catalog build result: ${success}`);

        // Reset to first available category if current doesn't exist
        const activeCategories = getActiveCategories();
        if (activeCategories.length > 0) {
          const firstCat = activeCategories[0]?.id;
          if (firstCat) {
            console.log(`[EditorToolbar] Setting active category to: ${firstCat}`);
            setActiveCategory(firstCat);
          }
        }
      } catch (err) {
        console.error(`[EditorToolbar] Error building dynamic catalog:`, err);
      }
    }
  }, [loadedAssets]);

  // For selected furniture: use existing color or default
  const effectiveColor = selectedFurnitureColor ?? DEFAULT_FURNITURE_COLOR;

  const categoryItems = getCatalogByCategory(activeCategory);

  const patternCount = getFloorPatternCount();
  // Wall is TileType 0, floor patterns are 1..patternCount
  const floorPatterns = Array.from({ length: patternCount }, (_, i) => i + 1);

  const thumbSize = 42; // 2x for items

  const isFloorActive = activeTool === EditTool.TILE_PAINT || activeTool === EditTool.EYEDROPPER;
  const isWallActive = activeTool === EditTool.WALL_PAINT;
  const isEraseActive = activeTool === EditTool.ERASE;
  const isZoneActive = activeTool === EditTool.ZONE_PAINT;
  const isRoomActive = activeTool === EditTool.ROOM;
  const isFurnitureActive =
    activeTool === EditTool.FURNITURE_PLACE || activeTool === EditTool.FURNITURE_PICK;
  const selectedRoom = projectRooms.find((room) => room.id === selectedProjectRoomId) ?? null;

  return (
    <div className="absolute bottom-76 left-10 z-10 pixel-panel p-4 flex flex-col-reverse gap-4 max-w-[calc(100vw-20px)]">
      {/* Tool row — at the bottom */}
      <div className="flex gap-4 flex-wrap">
        <Button
          variant={isFurnitureActive ? 'active' : 'default'}
          size="md"
          onClick={() => onToolChange(EditTool.FURNITURE_PLACE)}
          title="Place furniture"
        >
          Furniture
        </Button>
        <Button
          variant={isFloorActive ? 'active' : 'default'}
          size="md"
          onClick={() => onToolChange(EditTool.TILE_PAINT)}
          title="Paint floor tiles"
        >
          Floor
        </Button>
        <Button
          variant={isWallActive ? 'active' : 'default'}
          size="md"
          onClick={() => onToolChange(EditTool.WALL_PAINT)}
          title="Paint walls (click to toggle)"
        >
          Wall
        </Button>
        <Button
          variant={isZoneActive ? 'active' : 'default'}
          size="md"
          onClick={() => onToolChange(EditTool.ZONE_PAINT)}
          title="Paint work/rest zones"
        >
          Zone
        </Button>
        <Button
          variant={isRoomActive ? 'active' : 'default'}
          size="md"
          onClick={() => onToolChange(EditTool.ROOM)}
          title="Edit project room metadata"
        >
          Rooms
        </Button>
        <Button
          variant={isEraseActive ? 'active' : 'default'}
          size="md"
          onClick={() => onToolChange(EditTool.ERASE)}
          title="Erase tiles to void"
        >
          Erase
        </Button>
      </div>

      {/* Sub-panel: Floor tiles — stacked bottom-to-top via column-reverse */}
      {isFloorActive && (
        <div className="flex flex-col-reverse gap-4">
          {/* Color toggle + Pick — just above tool row */}
          <div className="flex gap-4 items-center">
            <Button
              variant={showColor ? 'active' : 'default'}
              size="sm"
              onClick={() => setShowColor((v) => !v)}
              title="Adjust floor color"
            >
              Color
            </Button>
            <Button
              variant={activeTool === EditTool.EYEDROPPER ? 'active' : 'ghost'}
              size="sm"
              onClick={() => onToolChange(EditTool.EYEDROPPER)}
              title="Pick floor pattern + color from existing tile"
            >
              Pick
            </Button>
          </div>

          {/* Color controls (collapsible) — above Wall/Color/Pick */}
          {showColor && <ColorPicker value={floorColor} onChange={onFloorColorChange} colorize />}

          {/* Floor pattern horizontal carousel — at the top */}
          <div className="carousel">
            {floorPatterns.map((patIdx) => (
              <ItemSelect
                key={patIdx}
                width={32}
                height={32}
                selected={selectedTileType === patIdx}
                onClick={() => onTileTypeChange(patIdx as TileTypeVal)}
                title={`Floor ${patIdx}`}
                deps={[patIdx, floorColor]}
                draw={(ctx, w, h) => {
                  if (!hasFloorSprites()) {
                    ctx.fillStyle = CANVAS_FALLBACK_TILE_COLOR;
                    ctx.fillRect(0, 0, w, h);
                    return;
                  }
                  const sprite = getColorizedFloorSprite(patIdx, floorColor);
                  ctx.drawImage(getCachedSprite(sprite, THUMB_ZOOM), 0, 0);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sub-panel: Wall — stacked bottom-to-top via column-reverse */}
      {isWallActive && (
        <div className="flex flex-col-reverse gap-4">
          {/* Color toggle — just above tool row */}
          <div className="flex gap-4 items-center">
            <Button
              variant={showWallColor ? 'active' : 'default'}
              size="sm"
              onClick={() => setShowWallColor((v) => !v)}
              title="Adjust wall color"
            >
              Color
            </Button>
          </div>

          {/* Color controls (collapsible) */}
          {showWallColor && <ColorPicker value={wallColor} onChange={onWallColorChange} colorize />}

          {/* Wall set picker — horizontal carousel at the top */}
          {getWallSetCount() > 0 && (
            <div className="carousel">
              {Array.from({ length: getWallSetCount() }, (_, i) => (
                <ItemSelect
                  key={i}
                  width={32}
                  height={64}
                  selected={selectedWallSet === i}
                  onClick={() => onWallSetChange(i)}
                  title={`Wall ${i + 1}`}
                  deps={[i, wallColor]}
                  draw={(ctx, w, h) => {
                    const sprite = getWallSetPreviewSprite(i);
                    if (!sprite) {
                      ctx.fillStyle = CANVAS_FALLBACK_TILE_COLOR;
                      ctx.fillRect(0, 0, w, h);
                      return;
                    }
                    const cacheKey = `wall-preview-${i}-${wallColor.h}-${wallColor.s}-${wallColor.b}-${wallColor.c}`;
                    const colorized = getColorizedSprite(cacheKey, sprite, {
                      ...wallColor,
                      colorize: true,
                    });
                    ctx.drawImage(getCachedSprite(colorized, THUMB_ZOOM), 0, 0);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sub-panel: Furniture — stacked bottom-to-top via column-reverse */}
      {isFurnitureActive && (
        <div className="flex flex-col-reverse gap-4">
          {/* Category tabs + Pick — just above tool row */}
          <div className="flex gap-4 flex-wrap items-center">
            {getActiveCategories().map((cat) => (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? 'active' : 'ghost'}
                size="sm"
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.label}
              </Button>
            ))}
            <div className="w-[1px] h-14 bg-white/15 mx-2 shrink-0" />
            <Button
              variant={activeTool === EditTool.FURNITURE_PICK ? 'active' : 'ghost'}
              size="sm"
              onClick={() => onToolChange(EditTool.FURNITURE_PICK)}
              title="Pick furniture type from placed item"
            >
              Pick
            </Button>
          </div>
          {/* Furniture items — single-row horizontal carousel at 2x */}
          <div className="carousel">
            {categoryItems.map((entry) => (
              <ItemSelect
                key={entry.type}
                width={thumbSize}
                height={thumbSize}
                selected={selectedFurnitureType === entry.type}
                onClick={() => onFurnitureTypeChange(entry.type)}
                title={entry.label}
                deps={[entry.type, entry.sprite]}
                draw={(ctx, w, h) => {
                  const cached = getCachedSprite(entry.sprite, 2);
                  const scale = Math.min(w / cached.width, h / cached.height) * 0.85;
                  const dw = cached.width * scale;
                  const dh = cached.height * scale;
                  ctx.drawImage(cached, (w - dw) / 2, (h - dh) / 2, dw, dh);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sub-panel: Zones */}
      {isZoneActive && (
        <div className="flex gap-4 items-center">
          <Button
            variant={selectedZone === 'work' ? 'active' : 'ghost'}
            size="sm"
            onClick={() => onZoneChange('work')}
            title="Mark tiles as work zone"
          >
            Work
          </Button>
          <Button
            variant={selectedZone === 'rest' ? 'active' : 'ghost'}
            size="sm"
            onClick={() => onZoneChange('rest')}
            title="Mark tiles as rest zone"
          >
            Rest
          </Button>
          <Button
            variant={selectedZone === 'meeting' ? 'active' : 'ghost'}
            size="sm"
            onClick={() => onZoneChange('meeting')}
            title="Mark tiles as meeting zone"
          >
            Meeting
          </Button>
          <Button
            variant={selectedZone === 'neutral' ? 'active' : 'ghost'}
            size="sm"
            onClick={() => onZoneChange('neutral')}
            title="Mark tiles as neutral zone"
          >
            Neutral
          </Button>
        </div>
      )}

      {/* Sub-panel: Project rooms */}
      {isRoomActive && (
        <div className="flex flex-col-reverse gap-4 min-w-[360px] max-w-[760px]">
          <div className="flex gap-4 flex-wrap items-center">
            <Button
              variant="default"
              size="sm"
              onClick={onAutoCreateRooms}
              title="Create rooms for visible projects"
            >
              Auto rooms
            </Button>
            <Button
              variant={!selectedRoom ? 'active' : 'ghost'}
              size="sm"
              onClick={() => onRoomSelect(null)}
              title="Clear selected room"
            >
              None
            </Button>
            {projectRooms.map((room) => (
              <Button
                key={room.id}
                variant={selectedProjectRoomId === room.id ? 'active' : 'ghost'}
                size="sm"
                onClick={() => onRoomSelect(room.id)}
                title={room.project?.key ?? room.kind}
              >
                {room.label || room.project?.displayName || room.kind}
              </Button>
            ))}
          </div>
          {selectedRoom ? (
            <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-3 items-center text-xs text-text">
              <label className="text-text-muted">Label</label>
              <input
                className="bg-bg-dark border-2 border-border px-2 py-1 text-text"
                value={selectedRoom.label ?? ''}
                onChange={(event) => onRoomUpdate({ label: event.target.value })}
              />
              <label className="text-text-muted">Kind</label>
              <select
                className="bg-bg-dark border-2 border-border px-2 py-1 text-text"
                value={selectedRoom.kind}
                onChange={(event) =>
                  onRoomUpdate({ kind: event.target.value as ProjectRoom['kind'] })
                }
              >
                {Object.values(ProjectRoomKind).map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
              <label className="text-text-muted">Project key</label>
              <input
                className="bg-bg-dark border-2 border-border px-2 py-1 text-text"
                value={selectedRoom.project?.key ?? ''}
                onChange={(event) => onRoomUpdate({ projectKey: event.target.value })}
              />
              <label className="text-text-muted">Project name</label>
              <input
                className="bg-bg-dark border-2 border-border px-2 py-1 text-text"
                value={selectedRoom.project?.displayName ?? ''}
                onChange={(event) => onRoomUpdate({ projectDisplayName: event.target.value })}
              />
              {(['col', 'row', 'width', 'height'] as const).map((field) => (
                <label key={field} className="contents">
                  <span className="text-text-muted">{field}</span>
                  <input
                    type="number"
                    className="bg-bg-dark border-2 border-border px-2 py-1 text-text w-24"
                    value={selectedRoom.bounds[field]}
                    onChange={(event) =>
                      onRoomUpdate({
                        [field]: Number(event.target.value),
                      } as ProjectRoomEditorPatch)
                    }
                  />
                </label>
              ))}
              <div className="col-span-4 flex justify-end">
                <Button
                  variant="accent"
                  size="sm"
                  onClick={onRoomDelete}
                  title="Delete room metadata only"
                >
                  Delete room
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-text-muted">
              Click an existing room to select it, or click empty floor to create room metadata.
            </div>
          )}
        </div>
      )}

      {/* Selected furniture color panel - shows when any placed furniture item is selected */}
      {selectedFurnitureUid && (
        <div className="flex flex-col-reverse gap-4">
          <div className="flex gap-4 items-center">
            <Button
              variant={showFurnitureColor ? 'active' : 'default'}
              size="sm"
              onClick={() => setShowFurnitureColor((v) => !v)}
              title="Adjust selected furniture color"
            >
              Color
            </Button>
            {selectedFurnitureColor && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelectedFurnitureColorChange(null)}
                title="Remove color (restore original)"
              >
                Clear
              </Button>
            )}
          </div>
          {showFurnitureColor && (
            <ColorPicker
              value={effectiveColor}
              onChange={onSelectedFurnitureColorChange}
              showColorizeToggle
            />
          )}
        </div>
      )}
    </div>
  );
}
