"use client";

import React, { useState, useRef, useEffect } from 'react';

interface MobileSwipeContainerProps {
  activeMobilePanel: number;
  setActiveMobilePanel: (panel: number) => void;
  isEventsPaneExpanded: boolean;
  children: [React.ReactNode, React.ReactNode, React.ReactNode]; // Expecting Transcript, AgentAnswers, Dashboard
}

const MobileSwipeContainer: React.FC<MobileSwipeContainerProps> = ({
  activeMobilePanel,
  setActiveMobilePanel,
  isEventsPaneExpanded,
  children,
}) => {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null); // Ref for dynamic styles

  const minSwipeDistance = 50; // Minimum required distance for swipe detection

  const handleTouchStart = (e: React.TouchEvent) => {
    // Allow touch tracking even if it starts on inner elements
    setTouchEnd(null); // Reset touch end on new start
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Only process move if swipe started within the container
    if(touchStart === null) return;

    const currentTouchX = e.targetTouches[0].clientX;
    setTouchEnd(currentTouchX);

    // Smoother visual feedback during swipe
    if (touchStart) {
      const difference = touchStart - currentTouchX;
      const maxDiff = window.innerWidth * 0.25; // Limit visual drag effect slightly more

      // Determine max panel index based on dashboard state
      const maxPanelIndex = isEventsPaneExpanded ? 2 : 1;

      // Prevent over-swipe visualization beyond boundaries
      if (activeMobilePanel === 0 && difference < -maxDiff) return; // Swiping right on first panel
      if (activeMobilePanel === maxPanelIndex && difference > maxDiff) return; // Swiping left on last panel

      // Only apply visual feedback if difference is within acceptable range
      if (Math.abs(difference) < maxDiff * 1.5) { // Allow slightly more movement before snapping back
        const swipePanels = containerRef.current?.querySelectorAll('.mobile-swipe-panel');
        if (!swipePanels) return;

        const translateOffset = -activeMobilePanel * 100; // Base offset in %

        // Adjust panel positions based on swipe difference
        swipePanels.forEach((panel, index) => {
          const el = panel as HTMLElement;
          el.style.transition = 'none'; // Disable transition during drag for direct feedback

          // Only apply drag effect to panels within the allowed range
          if (index <= maxPanelIndex) {
            const panelTranslate = translateOffset + (index * 100) - (difference / window.innerWidth * 100);
            el.style.transform = `translateX(${panelTranslate}%)`;
          } else {
            // For panels beyond the max index (e.g., dashboard when disabled),
            // keep them locked in their default off-screen position relative to the active panel.
            const lockedTranslate = translateOffset + (index * 100);
            el.style.transform = `translateX(${lockedTranslate}%)`;
          }
        });
      }
    }
  };

 const handleTouchEnd = () => {
    // Ensure swipe started within the container and move occurred
    if (!touchStart || !touchEnd) {
      resetPanelPositions(); // Reset if no valid swipe sequence
      return;
    }

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    // Reset touch tracking state
    setTouchStart(null);
    setTouchEnd(null);

    // Determine maximum panel index based on dashboard state
    const maxPanelIndex = isEventsPaneExpanded ? 2 : 1;

    let nextPanel = activeMobilePanel;
    if (isLeftSwipe && activeMobilePanel < maxPanelIndex) {
      // Swipe left to next panel
      nextPanel = activeMobilePanel + 1;
    } else if (isRightSwipe && activeMobilePanel > 0) {
      // Swipe right to previous panel
      nextPanel = activeMobilePanel - 1;
    }

    // Ensure the calculated nextPanel doesn't exceed the maximum allowed index
    if (nextPanel > maxPanelIndex) {
      nextPanel = maxPanelIndex; // Clamp it to the max allowed
    }

    if (nextPanel !== activeMobilePanel) {
      setActiveMobilePanel(nextPanel); // Update parent state
    } else {
       resetPanelPositions(true); // Snap back to current panel if no change
    }
     // Panel positions will update via effect when activeMobilePanel prop changes,
     // or snap back if no panel change occurred.
  };

  // Function to reset panels to their correct position based on activeMobilePanel
  const resetPanelPositions = (useTransition = true) => {
    const swipePanels = containerRef.current?.querySelectorAll('.mobile-swipe-panel');
     if (!swipePanels) return;

    const translateOffset = -activeMobilePanel * 100;
    swipePanels.forEach((panel, index) => {
      const el = panel as HTMLElement;
       el.style.transition = useTransition ? 'transform 0.3s ease-in-out' : 'none';
      el.style.transform = `translateX(${translateOffset + (index * 100)}%)`;
    });
  };

   // Effect to update panel positions when activeMobilePanel prop changes externally or after swipe
   useEffect(() => {
     resetPanelPositions();
   }, [activeMobilePanel]); // Rerun when the active panel changes

  return (
    <div
      ref={containerRef}
      className="mobile-swipe-container flex-1 relative" // Removed overflow-hidden
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Render children (panels) */}
      {children.map((panel, index) => (
        <div
          key={index}
          className="mobile-swipe-panel absolute top-0 left-0 w-full h-full"
           // Initial position set by effect, style updated during move/end
           style={{ transform: `translateX(${100 * index - activeMobilePanel * 100}%)` }}
        >
          {panel}
        </div>
      ))}

      {/* TEMP: Placeholder removed */}

       {/* Mobile Panel Indicators */}
       <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-3 pointer-events-none">
         {['Chat', 'Answers', 'Dashboard'].map((name, index) => {
           // Only show Dashboard indicator if the dashboard is enabled
           if (name === 'Dashboard' && !isEventsPaneExpanded) {
             return null;
           }

           return (
             <div
               key={index}
               className={`h-1.5 rounded-full transition-all duration-300 ${
                 activeMobilePanel === index
                   ? 'w-6 bg-blue-500'
                   : 'w-1.5 bg-gray-300'
               }`}
             />
           );
         })}
       </div>
    </div>
  );
};

export default MobileSwipeContainer; 