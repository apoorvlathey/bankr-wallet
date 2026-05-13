import { Composition } from "remotion";
import { AIAgentsNeedWallets } from "./compositions/AIAgentsNeedWallets";
import { V1Launch } from "./compositions/V1Launch";
import { Rebrand } from "./compositions/Rebrand";
import { ClearSigningLaunch } from "./compositions/ClearSigningLaunch";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AIAgentsNeedWallets"
        component={AIAgentsNeedWallets}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="V1Launch"
        component={V1Launch}
        durationInFrames={1500}
        fps={30}
        width={1080}
        height={1080}
      />
      <Composition
        id="Rebrand"
        component={Rebrand}
        durationInFrames={1102}
        fps={30}
        width={1080}
        height={1080}
      />
      <Composition
        id="ClearSigningLaunch"
        component={ClearSigningLaunch}
        durationInFrames={901}
        fps={30}
        width={1080}
        height={1080}
      />
    </>
  );
};
