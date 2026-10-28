type SuccessStatus<
  State extends string,
  Payload extends object | undefined,
> = Payload extends object ? { state: State } & Payload : { state: State };

export type AsyncActionStatus<
  PendingState extends string = "saving",
  SuccessState extends string = "saved",
  SuccessPayload extends object | undefined = undefined,
> =
  | { state: "idle" }
  | { state: PendingState }
  | SuccessStatus<SuccessState, SuccessPayload>
  | { state: "error"; message: string };
