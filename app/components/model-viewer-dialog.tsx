import '@esri/calcite-components/dist/components/calcite-button';
import '@esri/calcite-components/dist/components/calcite-dialog';
import '@esri/calcite-components/dist/components/calcite-loader';
import { CalciteButton, CalciteDialog, CalciteLoader } from "@esri/calcite-components-react";
import { lazy, Suspense, useRef, useState } from "react";
import { RootShellPortal } from "~/routes/_root/root-shell";

const ModelViewport = lazy(() => import("./model-viewport"));

export default function ModelViewerDialog({ open, initialFile, onClose }: {
  open: boolean;
  initialFile?: File;
  onClose: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [localFile, setLocalFile] = useState<File>();
  const file = localFile ?? initialFile;

  function close() {
    setLocalFile(undefined);
    onClose();
  }

  if (!open) return null;

  return (
    <RootShellPortal>
      <CalciteDialog
        heading="3D model viewer"
        slot="dialogs"
        width="l"
        modal
        open
        onCalciteDialogClose={close}
      >
        <CalciteButton slot="footer-start" iconStart="folder-open" onClick={() => picker.current?.click()}>
          Open GLB or STL
        </CalciteButton>
        <input
          ref={picker}
          type="file"
          accept=".glb,.stl"
          hidden
          onChange={(event) => {
            const nextFile = event.currentTarget.files?.[0];
            if (nextFile) setLocalFile(nextFile);
            event.currentTarget.value = "";
          }}
        />
        {file ? (
          <Suspense fallback={<CalciteLoader label="Loading model viewer" />}>
            <ModelViewport file={file} />
          </Suspense>
        ) : (
          <p className="py-8 text-center">Choose a GLB or STL file from your device to view it here.</p>
        )}
      </CalciteDialog>
    </RootShellPortal>
  );
}
