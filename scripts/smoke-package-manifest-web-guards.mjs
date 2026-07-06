export function assertPackageManifestWebGuards(context) {
  const { assert, webPackage } = context;

  assert(
    webPackage.dependencies["@qitu/auth"] === "workspace:*" &&
      webPackage.dependencies["@qitu/charts"] === "workspace:*",
    "web app must depend on shared auth policy and charts packages.",
  );
}
