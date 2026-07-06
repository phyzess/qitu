import { defineMessages } from "@qitu/i18n";
import { enCoreMessages } from "./messages-en-core";
import { enAuthMessages } from "./messages-en-auth";
import { enWorkflowMessages } from "./messages-en-workflow";
import { enReviewMessages } from "./messages-en-review";

export const enMessages = defineMessages({
  ...enCoreMessages,
  ...enAuthMessages,
  ...enWorkflowMessages,
  ...enReviewMessages,
});
