/** An issue or pull request, by repository: `owner/name` and its number. */
export interface IssueRef {
  repository: string;
  number: number;
}

/** A merged pull request, as a release reads which issues it relates to. */
export interface LinkedPr extends IssueRef {
  body: string;
  /** The issues GitHub says it closes. */
  closes: IssueRef[];
}

export const issueName = ({ repository, number }: IssueRef) => `${repository}#${number}`;
